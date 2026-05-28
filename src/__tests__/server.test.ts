import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { createApp } from "../server";
import type { AddonConfigStore } from "../core/addon-config";
import { EventStreamHub } from "../core/events";
import { SessionStore } from "../core/session";

describe("server api", () => {
	it("serves addon catalog from configured directories", async () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-server-"));
		const builtinDir = path.join(tempRoot, "addons");
		fs.mkdirSync(builtinDir, { recursive: true });
		fs.writeFileSync(
			path.join(builtinDir, "sample.json"),
			JSON.stringify(
				{
					name: "sample",
					version: "1.0.0",
					description: "sample addon",
					triggers: [{ name: "status", command: ["echo ok"] }],
				},
				null,
				2,
			),
			"utf8",
		);

		const app = createApp({
			session: new SessionStore(),
			events: new EventStreamHub(),
			addonOptions: {
				builtinDir,
				cwdDir: path.join(tempRoot, "cwd-addons"),
			},
		});

		const server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Expected TCP server address.");
		}

		const response = await fetch(`http://127.0.0.1:${address.port}/api/addons`);
		const json = await response.json();

		expect(response.ok).toBe(true);
		expect(json).toHaveLength(1);
		expect(json[0].addon.name).toBe("sample");

		await new Promise<void>((resolve) => server.close(() => resolve()));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it("requires an active ssh session for installed addons and vps status", async () => {
		const app = createApp({
			session: new SessionStore(),
			events: new EventStreamHub(),
		});

		const server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Expected TCP server address.");
		}

		const [installedResponse, statusResponse] = await Promise.all([fetch(`http://127.0.0.1:${address.port}/api/addons/installed`), fetch(`http://127.0.0.1:${address.port}/api/vps/status`)]);

		const installedJson = await installedResponse.json();
		const statusJson = await statusResponse.json();

		expect(installedResponse.status).toBe(400);
		expect(installedJson.message).toMatch(/Connect to a VPS/);
		expect(statusResponse.status).toBe(400);
		expect(statusJson.message).toMatch(/Connect to a VPS/);

		await new Promise<void>((resolve) => server.close(() => resolve()));
	});

	it("returns installed addons from persisted addon state", async () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-installed-"));
		const builtinDir = path.join(tempRoot, "addons");
		fs.mkdirSync(builtinDir, { recursive: true });
		fs.writeFileSync(
			path.join(builtinDir, "sample.json"),
			JSON.stringify(
				{
					name: "sample-addon",
					version: "1.2.3",
					description: "sample addon",
					triggers: [{ name: "status", command: ["echo ok"] }],
				},
				null,
				2,
			),
			"utf8",
		);

		const configStore: AddonConfigStore = {
			read: async () => ({
				version: 1,
				addons: {
					"sample-addon": {
						metadata: {
							name: "sample-addon",
							version: "1.2.3",
							installedAt: "2026-05-28T00:00:00.000Z",
							updatedAt: "2026-05-28T00:00:00.000Z",
						},
						state: "installed",
						scope: {},
						dependencies: [],
					},
				},
			}),
			getEntry: async (addonId) => {
				const data = await configStore.read();
				return data.addons[addonId];
			},
			upsert: async () => {
				throw new Error("not implemented");
			},
			setState: async () => {
				throw new Error("not implemented");
			},
			updateScope: async () => {
				throw new Error("not implemented");
			},
			remove: async () => {},
		};

		const fakeSession = {
			getSnapshot() {
				return { connected: true, busy: false };
			},
		} as SessionStore;

		const app = createApp({
			session: fakeSession,
			events: new EventStreamHub(),
			configStore,
			addonOptions: {
				builtinDir,
				cwdDir: path.join(tempRoot, "cwd-addons"),
			},
		});

		const server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Expected TCP server address.");
		}

		const response = await fetch(`http://127.0.0.1:${address.port}/api/addons/installed`);
		const json = await response.json();

		expect(response.ok).toBe(true);
		expect(json).toHaveLength(1);
		expect(json[0].addon.name).toBe("sample-addon");
		expect(json[0].detectedBy).toBe("addon-config");

		await new Promise<void>((resolve) => server.close(() => resolve()));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});

	it("exposes synchronous trigger execution for addon views", async () => {
		const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-execute-"));
		const builtinDir = path.join(tempRoot, "addons");
		fs.mkdirSync(builtinDir, { recursive: true });
		fs.writeFileSync(
			path.join(builtinDir, "sample.json"),
			JSON.stringify(
				{
					name: "sample",
					version: "1.0.0",
					description: "sample addon",
					triggers: {
						status: { command: ["echo ok"] },
					},
				},
				null,
				2,
			),
			"utf8",
		);

		const app = createApp({
			session: new SessionStore(),
			events: new EventStreamHub(),
			addonOptions: {
				builtinDir,
				cwdDir: path.join(tempRoot, "cwd-addons"),
			},
		});

		const server = http.createServer(app);
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

		const address = server.address();
		if (!address || typeof address === "string") {
			throw new Error("Expected TCP server address.");
		}

		const response = await fetch(`http://127.0.0.1:${address.port}/api/triggers/execute`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				addonName: "sample",
				triggerName: "status",
			}),
		});

		const json = await response.json();

		expect(response.status).toBe(400);
		expect(json.message).toMatch(/No active SSH session/);

		await new Promise<void>((resolve) => server.close(() => resolve()));
		fs.rmSync(tempRoot, { recursive: true, force: true });
	});
});
