import fs from "fs";
import path from "path";
import type { ClientChannel } from "ssh2";
import { SessionStore, type RemoteExecClient } from "./session";

export type AddonState = "pending" | "installed" | "error" | "uninstalled";

export interface AddonConfigMeta {
	name: string;
	version: string;
	installedAt: string | null;
	updatedAt: string;
	error?: string;
}

export interface AddonConfigEntry {
	metadata: AddonConfigMeta;
	state: AddonState;
	scope: Record<string, unknown>;
	dependencies: string[];
}

export interface AddonConfigFile {
	version: number;
	addons: Record<string, AddonConfigEntry>;
}

export interface AddonConfigStore {
	read(): Promise<AddonConfigFile>;
	getEntry(addonId: string): Promise<AddonConfigEntry | undefined>;
	upsert(
		addonId: string,
		patch: {
			metadata: Pick<AddonConfigMeta, "name" | "version">;
			state?: AddonState;
			scope?: Record<string, unknown>;
			dependencies?: string[];
		},
	): Promise<AddonConfigEntry>;
	setState(addonId: string, state: AddonState, error?: string): Promise<AddonConfigEntry | undefined>;
	updateScope(addonId: string, changes: Record<string, unknown>): Promise<AddonConfigEntry | undefined>;
	remove(addonId: string): Promise<void>;
}

const SCHEMA_VERSION = 1;
const REMOTE_CONFIG_DIR = "$HOME/.config/vps-manager";
const REMOTE_CONFIG_PATH = `${REMOTE_CONFIG_DIR}/vps-manager-addons.cfg`;

function createEmptyConfig(): AddonConfigFile {
	return { version: SCHEMA_VERSION, addons: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeConfig(value: unknown): AddonConfigFile {
	if (!isRecord(value) || typeof value.version !== "number") {
		return createEmptyConfig();
	}

	const config = value as any as AddonConfigFile;
	if (!isRecord(config.addons)) {
		config.addons = {};
	}

	return config;
}

function parseConfigContent(raw: string): AddonConfigFile {
	if (!raw.trim()) {
		return createEmptyConfig();
	}

	try {
		return normalizeConfig(JSON.parse(raw) as unknown);
	} catch {
		return createEmptyConfig();
	}
}

function runRemoteCommand(client: RemoteExecClient, command: string) {
	return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
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

			(stream as ClientChannel).on("close", (code: number | null) => {
				resolve({ stdout, stderr, code });
			});
		});
	});
}

function buildRemoteReadCommand() {
	return `if [ -f "${REMOTE_CONFIG_PATH}" ]; then cat "${REMOTE_CONFIG_PATH}"; fi`;
}

function buildRemoteWriteCommand(encodedContent: string) {
	return [
		"set -e",
		`mkdir -p "${REMOTE_CONFIG_DIR}"`,
		`tmp_file="${REMOTE_CONFIG_PATH}.tmp"`,
		`printf '%s' '${encodedContent}' | base64 -d > "$tmp_file"`,
		`mv "$tmp_file" "${REMOTE_CONFIG_PATH}"`,
	].join("; ");
}

export class FileAddonConfigStore implements AddonConfigStore {
	private readonly filePath: string;
	private writeQueue: Promise<unknown> = Promise.resolve();

	constructor(filePath: string) {
		this.filePath = filePath;
	}

	private readSync(): AddonConfigFile {
		if (!fs.existsSync(this.filePath)) {
			return createEmptyConfig();
		}

		try {
			const raw = fs.readFileSync(this.filePath, "utf8");
			return parseConfigContent(raw);
		} catch {
			return createEmptyConfig();
		}
	}

	async read(): Promise<AddonConfigFile> {
		return this.readSync();
	}

	private writeSync(data: AddonConfigFile): void {
		const dir = path.dirname(this.filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		const tmp = `${this.filePath}.tmp`;
		fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
		fs.renameSync(tmp, this.filePath);
	}

	private enqueueWrite(fn: (data: AddonConfigFile) => AddonConfigFile): Promise<AddonConfigFile> {
		const result = this.writeQueue.then(() => {
			const data = this.readSync();
			const updated = fn(data);
			this.writeSync(updated);
			return updated;
		}) as Promise<AddonConfigFile>;

		this.writeQueue = result.then(
			() => {},
			() => {},
		);

		return result;
	}

	async getEntry(addonId: string): Promise<AddonConfigEntry | undefined> {
		return this.readSync().addons[addonId];
	}

	async upsert(
		addonId: string,
		patch: {
			metadata: Pick<AddonConfigMeta, "name" | "version">;
			state?: AddonState;
			scope?: Record<string, unknown>;
			dependencies?: string[];
		},
	): Promise<AddonConfigEntry> {
		const updated = await this.enqueueWrite((data) => {
			const existing = data.addons[addonId];
			const now = new Date().toISOString();
			data.addons[addonId] = {
				metadata: {
					name: patch.metadata.name,
					version: patch.metadata.version,
					installedAt: existing?.metadata.installedAt ?? null,
					updatedAt: now,
				},
				state: patch.state ?? existing?.state ?? "pending",
				scope: { ...existing?.scope, ...patch.scope },
				dependencies: patch.dependencies ?? existing?.dependencies ?? [],
			};
			return data;
		});
		return updated.addons[addonId];
	}

	async setState(addonId: string, state: AddonState, error?: string): Promise<AddonConfigEntry | undefined> {
		const updated = await this.enqueueWrite((data) => {
			const existing = data.addons[addonId];
			if (!existing) return data;
			const now = new Date().toISOString();
			data.addons[addonId] = {
				...existing,
				state,
				metadata: {
					...existing.metadata,
					updatedAt: now,
					installedAt: state === "installed" && !existing.metadata.installedAt ? now : existing.metadata.installedAt,
					error: state === "error" ? error : undefined,
				},
			};
			return data;
		});
		return updated.addons[addonId];
	}

	async updateScope(addonId: string, changes: Record<string, unknown>): Promise<AddonConfigEntry | undefined> {
		const updated = await this.enqueueWrite((data) => {
			const existing = data.addons[addonId];
			if (!existing) return data;
			data.addons[addonId] = {
				...existing,
				scope: { ...existing.scope, ...changes },
				metadata: { ...existing.metadata, updatedAt: new Date().toISOString() },
			};
			return data;
		});
		return updated.addons[addonId];
	}

	async remove(addonId: string): Promise<void> {
		await this.enqueueWrite((data) => {
			delete data.addons[addonId];
			return data;
		});
	}
}

export class RemoteAddonConfigStore implements AddonConfigStore {
	private writeQueue: Promise<unknown> = Promise.resolve();

	constructor(private readonly session: SessionStore) {}

	private async readRemote(): Promise<AddonConfigFile> {
		if (!this.session.getSnapshot().connected) {
			return createEmptyConfig();
		}

		return this.session.runExclusive(async (client) => {
			const result = await runRemoteCommand(client, buildRemoteReadCommand());
			if (result.code !== 0 && result.code !== null) {
				throw new Error(result.stderr.trim() || "Failed to read add-on configuration from the VPS.");
			}

			return parseConfigContent(result.stdout);
		});
	}

	private async writeRemote(data: AddonConfigFile): Promise<void> {
		if (!this.session.getSnapshot().connected) {
			throw new Error("Connect to a VPS before updating add-on configuration.");
		}

		const encodedContent = Buffer.from(JSON.stringify(data, null, 2), "utf8").toString("base64");
		await this.session.runExclusive(async (client) => {
			const result = await runRemoteCommand(client, buildRemoteWriteCommand(encodedContent));
			if (result.code !== 0 && result.code !== null) {
				throw new Error(result.stderr.trim() || "Failed to persist add-on configuration on the VPS.");
			}
		});
	}

	private enqueueWrite(fn: (data: AddonConfigFile) => AddonConfigFile): Promise<AddonConfigFile> {
		const result = this.writeQueue.then(async () => {
			const data = await this.readRemote();
			const updated = fn(data);
			await this.writeRemote(updated);
			return updated;
		}) as Promise<AddonConfigFile>;

		this.writeQueue = result.then(
			() => {},
			() => {},
		);

		return result;
	}

	async read(): Promise<AddonConfigFile> {
		return this.readRemote();
	}

	async getEntry(addonId: string): Promise<AddonConfigEntry | undefined> {
		return (await this.readRemote()).addons[addonId];
	}

	async upsert(
		addonId: string,
		patch: {
			metadata: Pick<AddonConfigMeta, "name" | "version">;
			state?: AddonState;
			scope?: Record<string, unknown>;
			dependencies?: string[];
		},
	): Promise<AddonConfigEntry> {
		const updated = await this.enqueueWrite((data) => {
			const existing = data.addons[addonId];
			const now = new Date().toISOString();
			data.addons[addonId] = {
				metadata: {
					name: patch.metadata.name,
					version: patch.metadata.version,
					installedAt: existing?.metadata.installedAt ?? null,
					updatedAt: now,
				},
				state: patch.state ?? existing?.state ?? "pending",
				scope: { ...existing?.scope, ...patch.scope },
				dependencies: patch.dependencies ?? existing?.dependencies ?? [],
			};
			return data;
		});

		return updated.addons[addonId];
	}

	async setState(addonId: string, state: AddonState, error?: string): Promise<AddonConfigEntry | undefined> {
		const updated = await this.enqueueWrite((data) => {
			const existing = data.addons[addonId];
			if (!existing) {
				return data;
			}

			const now = new Date().toISOString();
			data.addons[addonId] = {
				...existing,
				state,
				metadata: {
					...existing.metadata,
					updatedAt: now,
					installedAt: state === "installed" && !existing.metadata.installedAt ? now : existing.metadata.installedAt,
					error: state === "error" ? error : undefined,
				},
			};
			return data;
		});

		return updated.addons[addonId];
	}

	async updateScope(addonId: string, changes: Record<string, unknown>): Promise<AddonConfigEntry | undefined> {
		const updated = await this.enqueueWrite((data) => {
			const existing = data.addons[addonId];
			if (!existing) {
				return data;
			}

			data.addons[addonId] = {
				...existing,
				scope: { ...existing.scope, ...changes },
				metadata: { ...existing.metadata, updatedAt: new Date().toISOString() },
			};
			return data;
		});

		return updated.addons[addonId];
	}

	async remove(addonId: string): Promise<void> {
		await this.enqueueWrite((data) => {
			delete data.addons[addonId];
			return data;
		});
	}
}
