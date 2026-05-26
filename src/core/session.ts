import { Client, type ClientChannel, type ConnectConfig } from "ssh2";

export type RemoteExecClient = Pick<Client, "exec">;

export interface SessionCapabilities {
	distro?: string;
	whoami?: string;
	isRoot: boolean;
	canUseSudoWithoutPassword: boolean;
}

export interface SessionSnapshot {
	connected: boolean;
	busy: boolean;
	host?: string;
	port?: number;
	username?: string;
	authMethod?: "password" | "privateKey";
	connectedAt?: string;
	capabilities?: SessionCapabilities;
}

export interface ConnectSessionInput {
	host?: string;
	port?: number;
	username?: string;
	password?: string;
	privateKey?: string;
	passphrase?: string;
}

interface CommandResult {
	stdout: string;
	stderr: string;
	code: number | null;
	signal?: string;
}

function normalizeConnectionInput(input: ConnectSessionInput) {
	const host = input.host?.trim();
	const username = input.username?.trim();
	const port = input.port && Number.isFinite(input.port) ? input.port : 22;

	if (!host) {
		throw new Error("Host is required.");
	}

	if (!username) {
		throw new Error("Username is required.");
	}

	if (!input.password && !input.privateKey) {
		throw new Error("Provide either a password or a private key.");
	}

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error("Port must be an integer between 1 and 65535.");
	}

	return {
		host,
		port,
		username,
		password: input.password,
		privateKey: input.privateKey,
		passphrase: input.passphrase,
	};
}

function parseOsRelease(content: string) {
	const lines = content.split(/\r?\n/);
	const values: Record<string, string> = {};

	for (const line of lines) {
		const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
		if (!match) {
			continue;
		}

		values[match[1]] = match[2].replace(/^"|"$/g, "");
	}

	return values.PRETTY_NAME || values.NAME;
}

function runRemoteCommand(client: RemoteExecClient, command: string) {
	return new Promise<CommandResult>((resolve, reject) => {
		client.exec(command, (error, stream) => {
			if (error) {
				reject(error);
				return;
			}

			let stdout = "";
			let stderr = "";

			(stream as ClientChannel).on("data", (chunk: Buffer | string) => {
				stdout += chunk.toString();
			});

			(stream as ClientChannel).stderr.on("data", (chunk: Buffer | string) => {
				stderr += chunk.toString();
			});

			(stream as ClientChannel).on("close", (code: number | null, signal: string | undefined) => {
				resolve({
					stdout,
					stderr,
					code,
					signal,
				});
			});
		});
	});
}

async function inspectRemoteHost(client: RemoteExecClient): Promise<SessionCapabilities> {
	const whoami = await runRemoteCommand(client, "whoami");
	const userId = await runRemoteCommand(client, "id -u");
	const osRelease = await runRemoteCommand(client, "if [ -f /etc/os-release ]; then cat /etc/os-release; else uname -a; fi");
	const sudoCheck = await runRemoteCommand(client, "if command -v sudo >/dev/null 2>&1; then sudo -n true >/dev/null 2>&1; printf %s $?; else printf %s 127; fi");
	const isRoot = userId.stdout.trim() === "0";

	return {
		whoami: whoami.stdout.trim() || undefined,
		distro: parseOsRelease(osRelease.stdout.trim()),
		isRoot,
		canUseSudoWithoutPassword: isRoot || sudoCheck.stdout.trim() === "0",
	};
}

export class SessionStore {
	private client: Client | undefined;
	private snapshot: SessionSnapshot = {
		connected: false,
		busy: false,
	};
	private intentionalDisconnect = false;

	getSnapshot(): SessionSnapshot {
		return {
			...this.snapshot,
			capabilities: this.snapshot.capabilities ? { ...this.snapshot.capabilities } : undefined,
		};
	}

	async connect(input: ConnectSessionInput) {
		const normalized = normalizeConnectionInput(input);
		await this.disconnect();

		const client = new Client();
		this.intentionalDisconnect = false;

		client.on("close", () => {
			if (!this.intentionalDisconnect) {
				this.snapshot = {
					connected: false,
					busy: false,
				};
			}
		});

		await new Promise<void>((resolve, reject) => {
			const config: ConnectConfig = {
				host: normalized.host,
				port: normalized.port,
				username: normalized.username,
				password: normalized.password,
				privateKey: normalized.privateKey,
				passphrase: normalized.passphrase,
				readyTimeout: 15000,
			};

			client.once("ready", () => resolve());
			client.once("error", (error) => reject(error));
			client.connect(config);
		});

		this.client = client;
		const capabilities = await inspectRemoteHost(client);
		this.snapshot = {
			connected: true,
			busy: false,
			host: normalized.host,
			port: normalized.port,
			username: normalized.username,
			authMethod: normalized.privateKey ? "privateKey" : "password",
			connectedAt: new Date().toISOString(),
			capabilities,
		};

		return this.getSnapshot();
	}

	async disconnect() {
		const client = this.client;
		this.client = undefined;
		this.snapshot = {
			connected: false,
			busy: false,
		};

		if (!client) {
			return;
		}

		this.intentionalDisconnect = true;
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => resolve(), 500);
			client.once("close", () => {
				clearTimeout(timer);
				resolve();
			});
			client.end();
		});
		this.intentionalDisconnect = false;
	}

	getClient(): RemoteExecClient {
		if (!this.client || !this.snapshot.connected) {
			throw new Error("No active SSH session.");
		}

		return this.client;
	}

	async runExclusive<T>(task: (client: RemoteExecClient) => Promise<T>): Promise<T> {
		if (this.snapshot.busy) {
			throw new Error("Another trigger is already running.");
		}

		const client = this.getClient();
		this.snapshot = {
			...this.snapshot,
			busy: true,
		};

		try {
			return await task(client);
		} finally {
			this.snapshot = {
				...this.snapshot,
				busy: false,
			};
		}
	}
}
