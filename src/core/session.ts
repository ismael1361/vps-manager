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

export interface ExclusiveTaskOptions {
	cacheKey?: string;
	cacheTtlMs?: number;
}

interface QueuedExclusiveTask {
	resolve: () => void;
	reject: (error: Error) => void;
}

interface CachedExclusiveTask {
	sessionId: number;
	expiresAt: number;
	pending: boolean;
	promise: Promise<unknown>;
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
		client.exec(command, { pty: true }, (error, stream) => {
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
	private activeSessionId = 0;
	private runningExclusiveTask = false;
	private pendingExclusiveTasks = 0;
	private waitingExclusiveTasks: QueuedExclusiveTask[] = [];
	private cachedExclusiveTasks = new Map<string, CachedExclusiveTask>();

	private getCachedExclusiveTask<T>(cacheKey: string, sessionId: number) {
		const cachedTask = this.cachedExclusiveTasks.get(cacheKey);
		if (!cachedTask) {
			return undefined;
		}

		if (cachedTask.sessionId !== sessionId) {
			this.cachedExclusiveTasks.delete(cacheKey);
			return undefined;
		}

		if (!cachedTask.pending && cachedTask.expiresAt <= Date.now()) {
			this.cachedExclusiveTasks.delete(cacheKey);
			return undefined;
		}

		return cachedTask.promise as Promise<T>;
	}

	private rememberCachedExclusiveTask<T>(cacheKey: string, sessionId: number, cacheTtlMs: number, task: Promise<T>) {
		const cachedTask: CachedExclusiveTask = {
			sessionId,
			expiresAt: Number.POSITIVE_INFINITY,
			pending: true,
			promise: task,
		};

		this.cachedExclusiveTasks.set(cacheKey, cachedTask);

		task.then(
			() => {
				if (this.cachedExclusiveTasks.get(cacheKey) !== cachedTask) {
					return;
				}

				cachedTask.pending = false;
				cachedTask.expiresAt = Date.now() + cacheTtlMs;
			},
			() => {
				if (this.cachedExclusiveTasks.get(cacheKey) === cachedTask) {
					this.cachedExclusiveTasks.delete(cacheKey);
				}
			},
		);

		return task;
	}

	clearCommandCache() {
		this.cachedExclusiveTasks.clear();
	}

	private syncBusySnapshot() {
		this.snapshot = {
			...this.snapshot,
			busy: this.snapshot.connected && this.pendingExclusiveTasks > 0,
		};
	}

	private async acquireExclusiveTurn() {
		this.pendingExclusiveTasks += 1;
		this.syncBusySnapshot();

		if (!this.runningExclusiveTask) {
			this.runningExclusiveTask = true;
			return;
		}

		await new Promise<void>((resolve, reject) => {
			this.waitingExclusiveTasks.push({ resolve, reject });
		});
	}

	private releaseExclusiveTurn() {
		if (this.pendingExclusiveTasks > 0) {
			this.pendingExclusiveTasks -= 1;
		}

		const next = this.waitingExclusiveTasks.shift();
		if (next) {
			next.resolve();
		} else {
			this.runningExclusiveTask = false;
		}

		this.syncBusySnapshot();
	}

	private flushWaitingExclusiveTasks(message: string) {
		if (this.waitingExclusiveTasks.length === 0) {
			this.syncBusySnapshot();
			return;
		}

		const error = new Error(message);
		const waiting = this.waitingExclusiveTasks.splice(0);
		this.pendingExclusiveTasks = Math.max(0, this.pendingExclusiveTasks - waiting.length);

		if (this.pendingExclusiveTasks === 0) {
			this.runningExclusiveTask = false;
		}

		this.syncBusySnapshot();

		for (const queuedTask of waiting) {
			queuedTask.reject(error);
		}
	}

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
				this.clearCommandCache();
				this.flushWaitingExclusiveTasks("SSH session was disconnected.");
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
		this.activeSessionId += 1;
		this.clearCommandCache();
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
		this.clearCommandCache();
		this.flushWaitingExclusiveTasks("SSH session was disconnected.");

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

	getClient(expectedSessionId: number = this.activeSessionId): RemoteExecClient {
		if (!this.client || !this.snapshot.connected) {
			throw new Error("No active SSH session.");
		}

		if (expectedSessionId !== this.activeSessionId) {
			throw new Error("No active SSH session.");
		}

		return this.client;
	}

	async runExclusive<T>(task: (client: RemoteExecClient) => Promise<T>, options?: ExclusiveTaskOptions): Promise<T> {
		const expectedSessionId = this.activeSessionId;
		this.getClient(expectedSessionId);
		const cacheKey = options?.cacheKey?.trim();
		const cacheTtlMs = typeof options?.cacheTtlMs === "number" && options.cacheTtlMs > 0 ? options.cacheTtlMs : 0;

		if (cacheKey && cacheTtlMs > 0) {
			const cachedTask = this.getCachedExclusiveTask<T>(cacheKey, expectedSessionId);
			if (cachedTask) {
				return cachedTask;
			}
		}

		const execution = (async () => {
			await this.acquireExclusiveTurn();

			try {
				return await task(this.getClient(expectedSessionId));
			} finally {
				this.releaseExclusiveTurn();
			}
		})();

		if (cacheKey && cacheTtlMs > 0) {
			return this.rememberCachedExclusiveTask(cacheKey, expectedSessionId, cacheTtlMs, execution);
		}

		return execution;
	}
}
