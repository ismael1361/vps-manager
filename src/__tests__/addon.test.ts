import fs from "fs";
import os from "os";
import path from "path";
import { loadAddons, parseAddonObject, parseAddonXml } from "../core/addon";

function writeJson(filePath: string, content: unknown) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf8");
}

function writeXml(filePath: string, content: string) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, content, "utf8");
}

describe("addon loader", () => {
	let tempRoot = "";

	afterEach(() => {
		if (tempRoot && fs.existsSync(tempRoot)) {
			fs.rmSync(tempRoot, { recursive: true, force: true });
		}
	});

	it("prefers XML addons over JSON addons with the same name", async () => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-addons-"));
		const builtinDir = path.join(tempRoot, "builtin");
		const cwdDir = path.join(tempRoot, "cwd");

		writeJson(path.join(builtinDir, "nginx.json"), {
			name: "nginx",
			version: "1.0.0",
			description: "builtin",
			triggers: [{ name: "status", command: ["echo ok"] }],
		});

		writeXml(
			path.join(cwdDir, "nginx"),
			[
				"<name>nginx</name>",
				"<version>2.0.0</version>",
				"<description>cwd</description>",
				"<triggers>",
				'  <trigger event="status">',
				"    <actions>",
				"      <command>echo override</command>",
				"    </actions>",
				"  </trigger>",
				"</triggers>",
			].join("\n"),
		);

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

	it("accepts XML manifests with validation and custom views", () => {
		const manifest = parseAddonXml(
			[
				"<addon>",
				"  <name>nginx</name>",
				"  <version>1.0.0</version>",
				"  <description>custom schema</description>",
				"  <triggers>",
				'    <trigger event="status">',
				"      <actions>",
				"        <command>echo ok</command>",
				"      </actions>",
				"    </trigger>",
				'    <trigger event="create_site">',
				"      <actions>",
				"        <command>printf '%s' {domain}</command>",
				"      </actions>",
				"      <inputs>",
				'        <input name="domain" type="text" validation="^[a-z0-9.-]+$" />',
				"      </inputs>",
				"    </trigger>",
				"  </triggers>",
				"  <views>",
				'    <view name="Dashboard">',
				"      <template>",
				"        <h1>OK</h1>",
				"      </template>",
				"    </view>",
				"  </views>",
				"</addon>",
			].join("\n"),
			"memory.xml",
		);

		expect(manifest.triggers.map((trigger) => trigger.name)).toEqual(["status", "create_site"]);
		expect(manifest.triggers[1].input?.[0].validation).toBe("^[a-z0-9.-]+$");
		expect(manifest.views?.[0].name).toBe("Dashboard");
	});

	it("rejects invalid validation regex definitions in XML manifests", () => {
		expect(() =>
			parseAddonXml(
				[
					"<addon>",
					"  <name>nginx</name>",
					"  <version>1.0.0</version>",
					"  <description>broken validation</description>",
					"  <triggers>",
					'    <trigger event="status">',
					"      <actions>",
					"        <command>echo ok</command>",
					"      </actions>",
					"      <inputs>",
					'        <input name="domain" type="text" validation="([" />',
					"      </inputs>",
					"    </trigger>",
					"  </triggers>",
					"</addon>",
				].join("\n"),
				"memory.xml",
			),
		).toThrow(/invalid validation regex/i);
	});
});
