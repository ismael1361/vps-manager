import fs from "fs";
import os from "os";
import path from "path";
import { loadAddons, parseAddonObject } from "../core/addon";

function writeJson(filePath: string, content: unknown) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");
}

describe("addon loader", () => {
	let tempRoot = "";

	afterEach(() => {
		if (tempRoot && fs.existsSync(tempRoot)) {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("overrides builtin addons with cwd addons using the same name", async () => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-addons-"));
		const builtinDir = path.join(tempRoot, "builtin");
		const cwdDir = path.join(tempRoot, "cwd");

		writeJson(path.join(builtinDir, "nginx.json"), {
			name: "nginx",
			version: "1.0.0",
			description: "builtin",
			triggers: [{ name: "status", command: ["echo ok"] }],
		});

		writeJson(path.join(cwdDir, "nginx.json"), {
			name: "nginx",
			version: "2.0.0",
			description: "cwd",
			triggers: [{ name: "status", command: ["echo override"] }],
		});

		const addons = await loadAddons({ builtinDir, cwdDir });

		expect(addons).toHaveLength(1);
		expect(addons[0].addon.version).toBe("2.0.0");
		expect(addons[0].addon.description).toBe("cwd");
		expect(addons[0].sourceType).toBe("cwd");
	});

	it("rejects addon files outside the agreed schema", () => {
		expect(() =>
			parseAddonObject(
				{
					name: "nginx",
					version: "1.0.0",
					description: "broken",
					triggers: [{ name: "status", command: ["echo ok"], extra: true }],
				},
				"memory.json",
			),
		).toThrow(/Unexpected key/);
	});
});
