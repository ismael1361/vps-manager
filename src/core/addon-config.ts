import fs from "fs";
import path from "path";

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

const SCHEMA_VERSION = 1;

function createEmptyConfig(): AddonConfigFile {
	return { version: SCHEMA_VERSION, addons: {} };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class AddonConfigStore {
	private readonly filePath: string;
	private writeQueue: Promise<unknown> = Promise.resolve();

	constructor(filePath: string) {
		this.filePath = filePath;
	}

	read(): AddonConfigFile {
		if (!fs.existsSync(this.filePath)) {
			return createEmptyConfig();
		}

		try {
			const raw = fs.readFileSync(this.filePath, "utf8");
			const parsed = JSON.parse(raw) as unknown;

			if (!isRecord(parsed) || typeof (parsed as { version?: unknown }).version !== "number") {
				return createEmptyConfig();
			}

			const config = parsed as unknown as AddonConfigFile;
			if (!isRecord(config.addons)) {
				config.addons = {};
			}

			return config;
		} catch {
			return createEmptyConfig();
		}
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
			const data = this.read();
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

	getEntry(addonId: string): AddonConfigEntry | undefined {
		return this.read().addons[addonId];
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
