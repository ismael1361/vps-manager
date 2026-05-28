import fs from "fs";
import os from "os";
import path from "path";
import { loadAddons, parseAddonObject, parseAddonXml, AddonManifest } from "../core/addon";
import { getBuiltInAddonsDir } from "../core/paths";

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
				'        <input name="domain" type="text" label="Domain" required="true" validation="^[a-z0-9.-]+$" />',
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
		expect(manifest.triggers[1].input?.[0].label).toBe("Domain");
		expect(manifest.triggers[1].input?.[0].required).toBe(true);
		expect(manifest.views?.[0].name).toBe("Dashboard");
	});

	it("skips invalid addons while keeping valid addons in the catalog", async () => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-addons-"));
		const builtinDir = path.join(tempRoot, "builtin");

		writeJson(path.join(builtinDir, "valid.json"), {
			name: "Valid Addon",
			version: "1.0.0",
			description: "still loads",
			triggers: [{ name: "status", command: ["echo ok"] }],
		});

		writeJson(path.join(builtinDir, "invalid.json"), {
			name: "Invalid Addon",
			version: "1.0.0",
			description: "breaks schema",
			triggers: [{ name: "status", command: ["echo ok"], extra: true }],
		});

		const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

		const addons = await loadAddons({ builtinDir, cwdDir: path.join(tempRoot, "cwd") });

		expect(addons).toHaveLength(1);
		expect(addons[0].addon.name).toBe("Valid Addon");
		expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Skipping invalid addon/));

		warnSpy.mockRestore();
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

	it("loads addon from directory with manifest.json and index file", async () => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-addons-"));
		const builtinDir = path.join(tempRoot, "builtin");
		const addonDir = path.join(builtinDir, "nginx-manager");

		writeJson(path.join(addonDir, "manifest.json"), {
			short_name: "nginx-manager",
			name: "Nginx Manager",
			version: "0.1.0",
			description: "Manage Nginx server blocks on your VPS.",
			screenshots: [],
		});

		writeXml(
			path.join(addonDir, "index"),
			[
				"<triggers>",
				'  <trigger event="status">',
				"    <actions>",
				"      <command>sudo systemctl status nginx --no-pager</command>",
				"    </actions>",
				"  </trigger>",
				'  <trigger event="restart">',
				"    <actions>",
				"      <command>sudo systemctl restart nginx</command>",
				"    </actions>",
				"  </trigger>",
				"</triggers>",
			].join("\n"),
		);

		const addons = await loadAddons({ builtinDir, cwdDir: path.join(tempRoot, "cwd") });

		expect(addons).toHaveLength(1);
		expect(addons[0].addon.short_name).toBe("nginx-manager");
		expect(addons[0].addon.name).toBe("Nginx Manager");
		expect(addons[0].addon.version).toBe("0.1.0");
		expect(addons[0].addon.description).toBe("Manage Nginx server blocks on your VPS.");
		expect(addons[0].addon.triggers.map((t) => t.name)).toEqual(["status", "restart"]);
		expect(addons[0].sourceType).toBe("builtin");
	});

	it("directory addon overrides flat-file addon with the same name", async () => {
		tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vps-manager-addons-"));
		const builtinDir = path.join(tempRoot, "builtin");

		// Flat-file addon
		writeJson(path.join(builtinDir, "nginx.json"), {
			name: "Nginx Manager",
			version: "1.0.0",
			description: "flat file",
			triggers: [{ name: "status", command: ["echo flat"] }],
		});

		// Directory addon with the same display name wins
		const addonDir = path.join(builtinDir, "nginx-manager");
		writeJson(path.join(addonDir, "manifest.json"), {
			short_name: "nginx-manager",
			name: "Nginx Manager",
			version: "2.0.0",
			description: "directory addon",
		});
		writeXml(
			path.join(addonDir, "index"),
			["<triggers>", '  <trigger event="status">', "    <actions>", "      <command>echo directory</command>", "    </actions>", "  </trigger>", "</triggers>"].join("\n"),
		);

		const addons = await loadAddons({ builtinDir, cwdDir: path.join(tempRoot, "cwd") });

		expect(addons).toHaveLength(1);
		expect(addons[0].addon.version).toBe("2.0.0");
	});

	it("parseAddonXml accepts metadata override suppressing inline name/version/description", () => {
		const meta: Partial<AddonManifest> = {
			short_name: "nginx-manager",
			name: "Nginx Manager",
			version: "0.1.0",
			description: "Managed via manifest.json",
		};

		const manifest = parseAddonXml(
			["<triggers>", '  <trigger event="status">', "    <actions>", "      <command>echo ok</command>", "    </actions>", "  </trigger>", "</triggers>"].join("\n"),
			"memory.xml",
			meta,
		);

		expect(manifest.name).toBe("Nginx Manager");
		expect(manifest.short_name).toBe("nginx-manager");
		expect(manifest.version).toBe("0.1.0");
		expect(manifest.triggers[0].name).toBe("status");
	});

	it("builtin nvm addon uses setState for render-driven view updates", () => {
		const addonDir = path.join(getBuiltInAddonsDir(), "nvm-manager");
		const meta = JSON.parse(fs.readFileSync(path.join(addonDir, "manifest.json"), "utf8")) as Partial<AddonManifest>;
		const manifest = parseAddonXml(fs.readFileSync(path.join(addonDir, "index"), "utf8"), path.join(addonDir, "index"), meta);

		const dashboardView = manifest.views?.find((view) => view.name === "Dashboard");
		const changeVersionView = manifest.views?.find((view) => view.name === "Change Node.js Version");

		expect(dashboardView?.content.join("\n")).toContain('setState("currentNodeVersion"');
		expect(changeVersionView?.content.join("\n")).toContain('setState("loading", true)');
		expect(changeVersionView?.content.join("\n")).toContain('setState("nodeVersionsList"');
		expect(changeVersionView?.content.join("\n")).toContain('getState("changeNodeVersion", "")');
		expect(changeVersionView?.content.join("\n")).toContain("state.changeNodeVersion = event.target.value");
	});
});
