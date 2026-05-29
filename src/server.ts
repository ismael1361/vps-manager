import express, { type Request, type Response } from "express";
import http from "http";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import net from "net";
import type { ClientChannel } from "ssh2";
import { EventStreamHub } from "./core/events";
import { getAddonByName, getTriggerByName, loadAddons, getAddonId, type LoadAddonsOptions } from "./core/addon";
import { FileAddonConfigStore, RemoteAddonConfigStore, type AddonConfigStore, type AddonState } from "./core/addon-config";
import { prepareTriggerExecution, executePreparedCommands, executePreparedCommandsWithOutput } from "./core/executor";
import { getPublicDir } from "./core/paths";
import { SessionStore, type ConnectSessionInput, type RemoteExecClient } from "./core/session";

export interface StartServerOptions {
	host?: string;
	preferredPort?: number;
	autoOpen?: boolean;
	addonOptions?: LoadAddonsOptions;
	configFilePath?: string;
}

export interface StartedServer {
	app: express.Express;
	server: http.Server;
	host: string;
	port: number;
	url: string;
	close(): Promise<void>;
}

export interface AppServices {
	session: SessionStore;
	events: EventStreamHub;
	addonOptions?: LoadAddonsOptions;
	configStore?: AddonConfigStore;
}

interface RemoteCommandResult {
	stdout: string;
	stderr: string;
	code: number | null;
	signal?: string;
}

const REMOTE_COMMAND_CACHE_TTL_MS = 5000;

const DEFAULT_PORT = 3000;
const MAX_PORT = 3100;

async function isPortAvailable(port: number, host: string) {
	return new Promise<boolean>((resolve, reject) => {
		const server = net.createServer();

		server.once("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") {
				resolve(false);
				return;
			}

			reject(error);
		});

		server.listen(port, host, () => {
			server.close(() => resolve(true));
		});
	});
}

async function findAvailablePort(startPort: number, endPort: number, host: string) {
	for (let port = startPort; port <= endPort; port += 1) {
		if (await isPortAvailable(port, host)) {
			return port;
		}
	}

	return null;
}

function getBaseUrl(server: http.Server, requestedHost: string) {
	const address = server.address();

	if (!address || typeof address === "string") {
		return `http://${requestedHost}`;
	}

	const bindHost = address.address === "::" || address.address === "0.0.0.0" ? "localhost" : address.address;
	const host = bindHost.includes(":") && !bindHost.startsWith("[") ? `[${bindHost}]` : bindHost;

	return `http://${host}:${address.port}`;
}

function errorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

function getStatusCode(error: unknown) {
	const message = errorMessage(error);

	if (/not found/i.test(message)) {
		return 404;
	}

	if (/busy/i.test(message)) {
		return 409;
	}

	if (/connect to a vps|no active ssh session|unsupported|invalid|required|provide|missing|sudo/i.test(message)) {
		return 400;
	}

	return 500;
}

function sendError(res: Response, error: unknown) {
	res.status(getStatusCode(error)).json({
		message: errorMessage(error),
	});
}

function runRemoteCommand(client: RemoteExecClient, command: string) {
	return new Promise<RemoteCommandResult>((resolve, reject) => {
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

function parseKeyValueOutput(content: string) {
	const values: Record<string, string> = {};

	for (const line of content.split(/\r?\n/)) {
		if (!line.trim()) {
			continue;
		}

		const separatorIndex = line.indexOf("=");
		if (separatorIndex === -1) {
			continue;
		}

		const key = line.slice(0, separatorIndex).trim();
		const value = line.slice(separatorIndex + 1).trim();
		if (key) {
			values[key] = value;
		}
	}

	return values;
}

function shouldCacheTriggerExecution(triggerName: string, commands: string[]) {
	if (commands.length !== 1) {
		return false;
	}

	if (/^(install|update|use|delete|edit|create|restart|reload|uninstall|save|apply|write|patch|remove)/i.test(triggerName)) {
		return false;
	}

	return /^(check|installed|status|list|read|get|show)/i.test(triggerName) || /version/i.test(triggerName);
}

async function readInstalledAddons(services: AppServices, configStore: AddonConfigStore) {
	if (!services.session.getSnapshot().connected) {
		throw new Error("Connect to a VPS before checking installed add-ons.");
	}

	const addons = await loadAddons(services.addonOptions);
	const config = await configStore.read();

	return addons
		.filter((entry) => config.addons[getAddonId(entry.addon)]?.state === "installed")
		.map((entry) => ({
			...entry,
			configEntry: config.addons[getAddonId(entry.addon)] ?? null,
			remoteVersion: config.addons[getAddonId(entry.addon)]?.metadata.version || entry.addon.version || "unknown",
			detectedBy: "addon-config",
		}));
}

async function readVpsStatus(services: AppServices) {
	const snapshot = services.session.getSnapshot();
	if (!snapshot.connected) {
		throw new Error("Connect to a VPS before requesting VPS status.");
	}

	const probeCommand = [
		"printf 'hostname='; hostname 2>/dev/null || true",
		"printf '\nos='; if [ -f /etc/os-release ]; then . /etc/os-release; printf '%s' \"${PRETTY_NAME:-$NAME}\"; else uname -s 2>/dev/null || true; fi",
		"printf '\narch='; uname -m 2>/dev/null || true",
		"printf '\\nkernel='; uname -r 2>/dev/null || true",
		"printf '\\nuptime='; uptime -p 2>/dev/null || uptime 2>/dev/null || true",
		"printf '\ncpu='; LC_ALL=C top -bn1 2>/dev/null | awk '/^%Cpu/ {for (i = 1; i <= NF; i += 1) {if ($i ~ /id,?$/) {gsub(/,/, \"\", $(i - 1)); printf \"%.1f%%\", 100 - $(i - 1); exit}}}' || true",
		"printf '\\nload='; cat /proc/loadavg 2>/dev/null | awk '{print $1\" \"$2\" \"$3}' || true",
		"printf '\\nmemory='; free -m 2>/dev/null | awk 'NR==2 {printf \"%s/%s MB\", $3, $2}' || true",
		"printf '\\ndisk='; df -h / 2>/dev/null | awk 'NR==2 {printf \"%s/%s (%s)\", $3, $2, $5}' || true",
		"printf '\\n'",
	].join("; ");

	const system = await services.session.runExclusive(
		async (client) => {
			const result = await runRemoteCommand(client, probeCommand);
			return parseKeyValueOutput(result.stdout);
		},
		{ cacheKey: probeCommand, cacheTtlMs: REMOTE_COMMAND_CACHE_TTL_MS },
	);

	return {
		connection: snapshot,
		system,
		detectedAt: new Date().toISOString(),
	};
}

export function createApp(services: AppServices) {
	const configStore: AddonConfigStore = services.configStore ?? new RemoteAddonConfigStore(services.session);
	const app = express();
	const publicDir = getPublicDir();

	app.use(express.json({ limit: "2mb" }));

	app.get("/api/health", async (_req: Request, res: Response) => {
		const addons = await loadAddons(services.addonOptions);
		res.json({
			ok: true,
			service: "vps-manager",
			catalogSize: addons.length,
			session: services.session.getSnapshot(),
			timestamp: new Date().toISOString(),
		});
	});

	app.get("/api/stream", (_req: Request, res: Response) => {
		services.events.attach(res);
	});

	app.get("/api/session", (_req: Request, res: Response) => {
		res.json(services.session.getSnapshot());
	});

	app.post("/api/session/connect", async (req: Request, res: Response) => {
		try {
			const snapshot = await services.session.connect(req.body as ConnectSessionInput);
			services.events.emit("session:changed", snapshot);
			res.status(201).json(snapshot);
		} catch (error) {
			sendError(res, error);
		}
	});

	app.post("/api/session/disconnect", async (_req: Request, res: Response) => {
		try {
			await services.session.disconnect();
			const snapshot = services.session.getSnapshot();
			services.events.emit("session:changed", snapshot);
			res.json(snapshot);
		} catch (error) {
			sendError(res, error);
		}
	});

	app.get("/api/addons", async (_req: Request, res: Response) => {
		try {
			const addons = await loadAddons(services.addonOptions);
			const config = await configStore.read();
			const result = addons.map((entry) => ({
				...entry,
				id: getAddonId(entry.addon),
				configEntry: config.addons[getAddonId(entry.addon)] ?? null,
			}));
			res.json(result);
		} catch (error) {
			sendError(res, error);
		}
	});

	// ---- Addon config routes (must be declared before /:name routes) ----

	app.get("/api/addons/config", async (_req: Request, res: Response) => {
		try {
			res.json(await configStore.read());
		} catch (error) {
			sendError(res, error);
		}
	});

	app.get("/api/addons/:id/config", async (req: Request, res: Response) => {
		try {
			const addonId = req.params["id"] as string;
			const entry = await configStore.getEntry(addonId);
			if (!entry) {
				res.status(404).json({ message: `No config entry for addon "${addonId}".` });
				return;
			}
			res.json(entry);
		} catch (error) {
			sendError(res, error);
		}
	});

	app.patch("/api/addons/:id/config", async (req: Request, res: Response) => {
		try {
			const {
				state,
				scope,
				error: errorMsg,
				metadata,
			} = req.body as {
				state?: AddonState;
				scope?: Record<string, unknown>;
				error?: string;
				metadata?: { name: string; version: string };
			};

			const addonId = req.params["id"] as string;

			if (metadata) {
				const entry = await configStore.upsert(addonId, {
					metadata,
					state: state ?? "pending",
					scope: scope ?? {},
				});
				services.events.emit("addon:config", { addonId, entry });
				res.json(entry);
				return;
			}

			let entry = await configStore.getEntry(addonId);
			if (!entry) {
				res.status(404).json({ message: `No config entry for addon "${addonId}".` });
				return;
			}

			if (state !== undefined) {
				entry = (await configStore.setState(addonId, state, errorMsg)) ?? entry;
			}

			if (scope !== undefined) {
				entry = (await configStore.updateScope(addonId, scope)) ?? entry;
			}

			services.events.emit("addon:config", { addonId, entry });
			res.json(entry);
		} catch (error) {
			sendError(res, error);
		}
	});

	app.delete("/api/addons/:id/config", async (req: Request, res: Response) => {
		try {
			const addonId = req.params["id"] as string;
			await configStore.remove(addonId);
			services.events.emit("addon:config", { addonId, entry: null });
			res.json({ removed: true });
		} catch (error) {
			sendError(res, error);
		}
	});

	app.get("/api/addons/installed", async (_req: Request, res: Response) => {
		try {
			const installedAddons = await readInstalledAddons(services, configStore);
			res.json(installedAddons);
		} catch (error) {
			sendError(res, error);
		}
	});

	app.get("/api/vps/status", async (_req: Request, res: Response) => {
		try {
			const status = await readVpsStatus(services);
			res.json(status);
		} catch (error) {
			sendError(res, error);
		}
	});

	app.post("/api/triggers/preview", async (req: Request, res: Response) => {
		try {
			const { addonName, triggerName, inputs } = req.body as {
				addonName?: string;
				triggerName?: string;
				inputs?: Record<string, string>;
			};

			if (!addonName || !triggerName) {
				throw new Error("addonName and triggerName are required.");
			}

			const addons = await loadAddons(services.addonOptions);
			const addon = getAddonByName(addons, addonName);
			const trigger = getTriggerByName(addon.addon, triggerName);
			const preview = prepareTriggerExecution({
				trigger,
				inputs,
				snapshot: services.session.getSnapshot(),
			});

			res.json({
				addonName: addon.addon.name,
				triggerName: trigger.name,
				commands: preview.commands,
				warnings: preview.warnings,
				referencedInputs: preview.referencedInputs,
			});
		} catch (error) {
			sendError(res, error);
		}
	});

	app.post("/api/triggers/execute", async (req: Request, res: Response) => {
		try {
			const { addonName, triggerName, inputs } = req.body as {
				addonName?: string;
				triggerName?: string;
				inputs?: Record<string, string>;
			};

			if (!addonName || !triggerName) {
				throw new Error("addonName and triggerName are required.");
			}

			const addons = await loadAddons(services.addonOptions);
			const addon = getAddonByName(addons, addonName);
			const trigger = getTriggerByName(addon.addon, triggerName);
			const prepared = prepareTriggerExecution({
				trigger,
				inputs,
				snapshot: services.session.getSnapshot(),
			});
			const executionId = randomUUID();
			const shouldCache = shouldCacheTriggerExecution(trigger.name, prepared.commands);
			const result = await executePreparedCommandsWithOutput({
				executionId,
				addonName: addon.addon.name,
				triggerName: trigger.name,
				commands: prepared.commands,
				session: services.session,
				cacheKey: shouldCache ? prepared.commands[0] : undefined,
				cacheTtlMs: shouldCache ? REMOTE_COMMAND_CACHE_TTL_MS : undefined,
			});

			if (!shouldCache) {
				services.session.clearCommandCache();
			}

			res.json({
				executionId,
				addonName: addon.addon.name,
				triggerName: trigger.name,
				commands: prepared.commands,
				warnings: prepared.warnings,
				outputs: result.outputs,
				stdout: result.stdout,
				stderr: result.stderr,
			});
		} catch (error) {
			sendError(res, error);
		}
	});

	app.post("/api/triggers/run", async (req: Request, res: Response) => {
		try {
			const { addonName, triggerName, inputs } = req.body as {
				addonName?: string;
				triggerName?: string;
				inputs?: Record<string, string>;
			};

			if (!addonName || !triggerName) {
				throw new Error("addonName and triggerName are required.");
			}

			const addons = await loadAddons(services.addonOptions);
			const addon = getAddonByName(addons, addonName);
			const trigger = getTriggerByName(addon.addon, triggerName);
			const prepared = prepareTriggerExecution({
				trigger,
				inputs,
				snapshot: services.session.getSnapshot(),
			});
			const executionId = randomUUID();

			void executePreparedCommands({
				executionId,
				addonName: addon.addon.name,
				triggerName: trigger.name,
				commands: prepared.commands,
				session: services.session,
				events: services.events,
			})
				.then(() => {
					services.session.clearCommandCache();
				})
				.catch((error) => {
					console.error(errorMessage(error));
				});

			res.status(202).json({
				accepted: true,
				executionId,
				warnings: prepared.warnings,
			});
		} catch (error) {
			sendError(res, error);
		}
	});

	if (fs.existsSync(publicDir)) {
		app.use(express.static(publicDir));
	}

	app.get(/.*/, (_req: Request, res: Response) => {
		const indexPath = path.join(publicDir, "index.html");
		if (!fs.existsSync(indexPath)) {
			res.status(404).json({ message: "UI not built yet." });
			return;
		}

		res.sendFile(indexPath);
	});

	return app;
}

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
	const host = options.host || "127.0.0.1";
	const requestedPort = options.preferredPort || DEFAULT_PORT;
	const port = (await findAvailablePort(requestedPort, MAX_PORT, host)) ?? requestedPort;
	const session = new SessionStore();
	const services: AppServices = {
		session,
		events: new EventStreamHub(),
		addonOptions: options.addonOptions,
		configStore: options.configFilePath ? new FileAddonConfigStore(path.resolve(options.configFilePath)) : new RemoteAddonConfigStore(session),
	};
	const app = createApp(services);
	const server = http.createServer(app);
	const shutdown = async () => {
		await services.session.disconnect();
		services.events.close();
		await new Promise<void>((resolve) => {
			server.close(() => resolve());
		});
	};
	let closing = false;
	const handleSignal = () => {
		if (closing) {
			return;
		}

		closing = true;
		void shutdown().finally(() => {
			process.exit(0);
		});
	};

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, () => resolve());
	});

	process.once("SIGINT", handleSignal);
	process.once("SIGTERM", handleSignal);

	const url = getBaseUrl(server, host);
	console.log(`VPS Manager listening on ${url}`);

	if (options.autoOpen !== false) {
		const { default: openBrowser } = await import("open");
		await openBrowser(url);
	}

	return {
		app,
		server,
		host,
		port,
		url,
		async close() {
			process.removeListener("SIGINT", handleSignal);
			process.removeListener("SIGTERM", handleSignal);
			await services.session.disconnect();
			services.events.close();
			await new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}

					resolve();
				});
			});
		},
	};
}
