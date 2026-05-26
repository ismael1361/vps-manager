import fs from "fs";
import path from "path";
import { getBuiltInAddonsDir, getWorkingDirectoryAddonsDir } from "./paths";

export interface AddonInputDefinition {
	name: string;
	type: string;
	placeholder?: string;
}

export interface AddonTriggerDefinition {
	name: string;
	command: string[];
	input?: AddonInputDefinition[];
}

export interface AddonManifest {
	name: string;
	version: string;
	description: string;
	triggers: AddonTriggerDefinition[];
}

export interface LoadedAddon {
	addon: AddonManifest;
	sourcePath: string;
	sourceType: "builtin" | "cwd" | "custom";
}

export interface LoadAddonsOptions {
	cwd?: string;
	builtinDir?: string;
	cwdDir?: string;
	extraDirs?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertAllowedKeys(record: Record<string, unknown>, allowedKeys: string[], scope: string, sourcePath: string) {
	for (const key of Object.keys(record)) {
		if (!allowedKeys.includes(key)) {
			throw new Error(`Unexpected key "${key}" in ${scope} at ${sourcePath}.`);
		}
	}
}

function ensureString(value: unknown, scope: string, sourcePath: string) {
	if (typeof value !== "string" || value.trim() === "") {
		throw new Error(`${scope} must be a non-empty string at ${sourcePath}.`);
	}

	return value;
}

export function parseAddonObject(value: unknown, sourcePath: string): AddonManifest {
	if (!isRecord(value)) {
		throw new Error(`Addon file must contain a JSON object at ${sourcePath}.`);
	}

	assertAllowedKeys(value, ["name", "version", "description", "triggers"], "addon root", sourcePath);

	const name = ensureString(value.name, "Addon name", sourcePath);
	const version = ensureString(value.version, "Addon version", sourcePath);
	const description = ensureString(value.description, "Addon description", sourcePath);

	if (!Array.isArray(value.triggers) || value.triggers.length === 0) {
		throw new Error(`Addon triggers must be a non-empty array at ${sourcePath}.`);
	}

	const triggers = value.triggers.map((triggerValue, triggerIndex) => {
		if (!isRecord(triggerValue)) {
			throw new Error(`Trigger at index ${triggerIndex} must be an object at ${sourcePath}.`);
		}

		assertAllowedKeys(triggerValue, ["name", "command", "input"], `trigger ${triggerIndex}`, sourcePath);

		const triggerName = ensureString(triggerValue.name, `Trigger name at index ${triggerIndex}`, sourcePath);

		if (!Array.isArray(triggerValue.command) || triggerValue.command.length === 0) {
			throw new Error(`Trigger command must be a non-empty array at ${sourcePath}.`);
		}

		const command = triggerValue.command.map((commandValue, commandIndex) => ensureString(commandValue, `Trigger command ${triggerName}[${commandIndex}]`, sourcePath));

		if (triggerValue.input !== undefined && !Array.isArray(triggerValue.input)) {
			throw new Error(`Trigger input must be an array at ${sourcePath}.`);
		}

		const input = Array.isArray(triggerValue.input)
			? triggerValue.input.map((inputValue, inputIndex) => {
					if (!isRecord(inputValue)) {
						throw new Error(`Trigger input at index ${inputIndex} must be an object at ${sourcePath}.`);
					}

					assertAllowedKeys(inputValue, ["name", "type", "placeholder"], `trigger input ${triggerName}[${inputIndex}]`, sourcePath);

					return {
						name: ensureString(inputValue.name, `Trigger input name ${triggerName}[${inputIndex}]`, sourcePath),
						type: ensureString(inputValue.type, `Trigger input type ${triggerName}[${inputIndex}]`, sourcePath),
						placeholder: typeof inputValue.placeholder === "string" ? inputValue.placeholder : undefined,
					};
				})
			: undefined;

		return {
			name: triggerName,
			command,
			input,
		};
	});

	return {
		name,
		version,
		description,
		triggers,
	};
}

async function readAddonsFromDirectory(directoryPath: string, sourceType: LoadedAddon["sourceType"]) {
	if (!fs.existsSync(directoryPath)) {
		return [] as LoadedAddon[];
	}

	const entries = fs
		.readdirSync(directoryPath)
		.filter((entry) => entry.toLowerCase().endsWith(".json"))
		.sort((left, right) => left.localeCompare(right));

	return entries.map((entry) => {
		const sourcePath = path.join(directoryPath, entry);
		const raw = fs.readFileSync(sourcePath, "utf8");
		const parsed = JSON.parse(raw);
		const addon = parseAddonObject(parsed, sourcePath);

		return {
			addon,
			sourcePath,
			sourceType,
		};
	});
}

export async function loadAddons(options: LoadAddonsOptions = {}) {
	const builtinDir = options.builtinDir || getBuiltInAddonsDir();
	const cwdDir = options.cwdDir || getWorkingDirectoryAddonsDir(options.cwd);
	const sources = [...(await readAddonsFromDirectory(builtinDir, "builtin")), ...(await readAddonsFromDirectory(cwdDir, "cwd"))];

	for (const extraDir of options.extraDirs || []) {
		sources.push(...(await readAddonsFromDirectory(extraDir, "custom")));
	}

	const merged = new Map<string, LoadedAddon>();
	for (const entry of sources) {
		merged.set(entry.addon.name, entry);
	}

	return Array.from(merged.values()).sort((left, right) => left.addon.name.localeCompare(right.addon.name));
}

export function getAddonByName(addons: LoadedAddon[], addonName: string) {
	const addon = addons.find((entry) => entry.addon.name === addonName);
	if (!addon) {
		throw new Error(`Addon "${addonName}" not found.`);
	}

	return addon;
}

export function getTriggerByName(addon: AddonManifest, triggerName: string) {
	const trigger = addon.triggers.find((entry) => entry.name === triggerName);
	if (!trigger) {
		throw new Error(`Trigger "${triggerName}" not found in addon "${addon.name}".`);
	}

	return trigger;
}
