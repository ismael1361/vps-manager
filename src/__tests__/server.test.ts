import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { createApp } from "../server";
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
});
