import fs from "fs";
import path from "path";
import { getBuiltInAddonsDir, getWorkingDirectoryAddonsDir } from "./paths";

export interface AddonInputDefinition {
	name: string;
	type: string;
	label?: string;
	required?: boolean;
	placeholder?: string;
	validation?: string;
}

export interface AddonTriggerDefinition {
	name: string;
	command: string[];
	input?: AddonInputDefinition[];
}

export interface AddonViewDefinition {
	name: string;
	content: string[];
}

export interface AddonIconDefinition {
	src: string;
	type?: string;
	sizes?: string;
}

export interface AddonManifest {
	short_name?: string;
	name: string;
	version: string;
	description: string;
	icon?: AddonIconDefinition;
	screenshots?: string[];
	triggers: AddonTriggerDefinition[];
	views?: AddonViewDefinition[];
	/** Root-level lifecycle script (install / initialize / uninstall functions). */
	script?: string;
}

/**
 * Returns a stable, URL-safe identifier for an addon.
 * Uses `short_name` when available, otherwise derives from `name`.
 */
export function getAddonId(addon: AddonManifest): string {
	return (
		addon.short_name ||
		addon.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "")
	);
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

type SupportedAddonFormat = "json" | "xml";

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

function decodeXmlEntities(value: string) {
	return value
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, "&");
}

function normalizeXmlText(value: string) {
	return decodeXmlEntities(value).replace(/\r\n?/g, "\n");
}

function normalizeXmlDocument(raw: string, sourcePath: string) {
	const withoutBom = raw.replace(/^\uFEFF/, "");
	const withoutDeclaration = withoutBom.replace(/^\s*<\?xml[\s\S]*?\?>\s*/i, "");
	const trimmed = withoutDeclaration.trim();

	if (!trimmed) {
		throw new Error(`Addon XML file is empty at ${sourcePath}.`);
	}

	return /^<addon(?:\s|>)/i.test(trimmed) ? trimmed : `<addon>${trimmed}</addon>`;
}

function parseXmlAttributes(attributeSource: string | undefined, scope: string, sourcePath: string) {
	const attributes: Record<string, string> = {};
	const source = attributeSource || "";
	const attributeExpression = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

	for (const match of source.matchAll(attributeExpression)) {
		attributes[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
	}

	const remainder = source.replace(attributeExpression, "").trim();
	if (remainder) {
		throw new Error(`Invalid XML attributes in ${scope} at ${sourcePath}.`);
	}

	return attributes;
}

function collectXmlElements(source: string, tagName: string) {
	const expression = new RegExp(`<${tagName}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "gi");
	return Array.from(source.matchAll(expression)).map((match) => ({
		attributes: parseXmlAttributes(match[1], `<${tagName}>`, "xml"),
		inner: match[2],
	}));
}

function getXmlContainerInner(source: string, tagName: string, sourcePath: string): string;
function getXmlContainerInner(source: string, tagName: string, sourcePath: string, required: false): string | undefined;
function getXmlContainerInner(source: string, tagName: string, sourcePath: string, required = true) {
	const expression = new RegExp(`<${tagName}(\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, "i");
	const match = source.match(expression);

	if (!match) {
		if (required) {
			throw new Error(`Missing <${tagName}> block at ${sourcePath}.`);
		}

		return undefined;
	}

	return match[2];
}

function parseXmlInputDefinitions(source: string, scope: string, sourcePath: string) {
	const expression = /<input(\s[^>]*)?(?:\s*\/\s*>|>([\s\S]*?)<\/input>)/gi;
	return Array.from(source.matchAll(expression)).map((match, index) => {
		const attributes = parseXmlAttributes(match[1], `${scope}[${index}]`, sourcePath);
		return parseInputDefinition(attributes, `${scope}[${index}]`, sourcePath);
	});
}

function parseXmlViewContent(source: string, scope: string, sourcePath: string) {
	const expression = /<(script|template|style)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
	const content: string[] = [];

	for (const match of source.matchAll(expression)) {
		const tagName = match[1].toLowerCase();
		const rawAttrs = (match[2] || "").trim();
		const attributes = parseXmlAttributes(match[2], `${scope} <${tagName}>`, sourcePath);

		// <template if="..."> is the only supported attribute-bearing tag
		const allowedAttrs: Record<string, string[]> = { template: ["if"] };
		const allowed = allowedAttrs[tagName] ?? [];
		const unsupported = Object.keys(attributes).filter((k) => !allowed.includes(k));
		if (unsupported.length > 0) {
			throw new Error(`Unsupported attributes in ${scope} <${tagName}> at ${sourcePath}.`);
		}

		if (content.length > 0) {
			content.push("");
		}

		// Preserve recognised attributes (e.g. if) in the opening tag
		const openTag = rawAttrs ? `<${tagName} ${rawAttrs}>` : `<${tagName}>`;
		content.push(openTag);

		const body = normalizeXmlText(match[3]).replace(/^\n+/, "").replace(/\n+$/, "");
		if (body) {
			content.push(...body.split("\n"));
		}

		content.push(`</${tagName}>`);
	}

	if (content.length > 0) {
		return content;
	}

	const fallback = normalizeXmlText(source).trim();
	return fallback ? fallback.split("\n") : [];
}

function parseInputDefinition(value: unknown, scope: string, sourcePath: string): AddonInputDefinition {
	if (!isRecord(value)) {
		throw new Error(`${scope} must be an object at ${sourcePath}.`);
	}

	assertAllowedKeys(value, ["name", "type", "label", "required", "placeholder", "validation"], scope, sourcePath);

	const validation = typeof value.validation === "string" ? value.validation : undefined;
	if (validation) {
		try {
			new RegExp(validation);
		} catch (error) {
			throw new Error(`${scope} contains an invalid validation regex at ${sourcePath}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	return {
		name: ensureString(value.name, `${scope} name`, sourcePath),
		type: ensureString(value.type, `${scope} type`, sourcePath),
		label: typeof value.label === "string" ? value.label : undefined,
		required: typeof value.required === "boolean" ? value.required : typeof value.required === "string" ? value.required.toLowerCase() !== "false" : undefined,
		placeholder: typeof value.placeholder === "string" ? value.placeholder : undefined,
		validation,
	};
}

function parseTriggerValue(triggerName: string, triggerValue: unknown, sourcePath: string): AddonTriggerDefinition {
	if (!isRecord(triggerValue)) {
		throw new Error(`Trigger "${triggerName}" must be an object at ${sourcePath}.`);
	}

	assertAllowedKeys(triggerValue, ["name", "command", "input"], `trigger ${triggerName}`, sourcePath);

	if (!Array.isArray(triggerValue.command) || triggerValue.command.length === 0) {
		throw new Error(`Trigger command must be a non-empty array at ${sourcePath}.`);
	}

	const command = triggerValue.command.map((commandValue, commandIndex) => ensureString(commandValue, `Trigger command ${triggerName}[${commandIndex}]`, sourcePath));

	if (triggerValue.input !== undefined && !Array.isArray(triggerValue.input)) {
		throw new Error(`Trigger input must be an array at ${sourcePath}.`);
	}

	const input = Array.isArray(triggerValue.input)
		? triggerValue.input.map((inputValue, inputIndex) => parseInputDefinition(inputValue, `trigger input ${triggerName}[${inputIndex}]`, sourcePath))
		: undefined;

	return {
		name: typeof triggerValue.name === "string" && triggerValue.name.trim() ? triggerValue.name : triggerName,
		command,
		input,
	};
}

function parseTriggers(value: unknown, sourcePath: string) {
	if (Array.isArray(value)) {
		if (value.length === 0) {
			throw new Error(`Addon triggers must be a non-empty array at ${sourcePath}.`);
		}

		return value.map((triggerValue, triggerIndex) => {
			if (!isRecord(triggerValue)) {
				throw new Error(`Trigger at index ${triggerIndex} must be an object at ${sourcePath}.`);
			}

			const triggerName = ensureString(triggerValue.name, `Trigger name at index ${triggerIndex}`, sourcePath);
			return parseTriggerValue(triggerName, triggerValue, sourcePath);
		});
	}

	if (isRecord(value)) {
		const entries = Object.entries(value);
		if (entries.length === 0) {
			throw new Error(`Addon triggers must be a non-empty object at ${sourcePath}.`);
		}

		return entries.map(([triggerName, triggerValue]) => {
			const normalizedName = ensureString(triggerName, "Trigger name", sourcePath);
			return parseTriggerValue(normalizedName, triggerValue, sourcePath);
		});
	}

	throw new Error(`Addon triggers must be a non-empty array or object at ${sourcePath}.`);
}

function parseViews(value: unknown, sourcePath: string) {
	if (value === undefined) {
		return undefined;
	}

	if (!Array.isArray(value)) {
		throw new Error(`Addon views must be an array at ${sourcePath}.`);
	}

	return value.map((viewValue, viewIndex) => {
		if (!isRecord(viewValue)) {
			throw new Error(`View at index ${viewIndex} must be an object at ${sourcePath}.`);
		}

		assertAllowedKeys(viewValue, ["name", "content"], `view ${viewIndex}`, sourcePath);

		if (!Array.isArray(viewValue.content)) {
			throw new Error(`View content must be an array at ${sourcePath}.`);
		}

		return {
			name: ensureString(viewValue.name, `View name at index ${viewIndex}`, sourcePath),
			content: viewValue.content.map((line, lineIndex) => {
				if (typeof line !== "string") {
					throw new Error(`View content line ${viewIndex}[${lineIndex}] must be a string at ${sourcePath}.`);
				}

				return line;
			}),
		};
	});
}

export function parseAddonObject(value: unknown, sourcePath: string): AddonManifest {
	if (!isRecord(value)) {
		throw new Error(`Addon file must contain a JSON object at ${sourcePath}.`);
	}

	assertAllowedKeys(value, ["short_name", "name", "version", "description", "icon", "screenshots", "triggers", "view", "views", "script"], "addon root", sourcePath);

	const name = ensureString(value.name, "Addon name", sourcePath);
	const version = ensureString(value.version, "Addon version", sourcePath);
	const description = ensureString(value.description, "Addon description", sourcePath);
	const short_name = typeof value.short_name === "string" && value.short_name.trim() ? value.short_name.trim() : undefined;
	const icon = isRecord(value.icon) ? (value.icon as unknown as AddonIconDefinition) : undefined;
	const screenshots = Array.isArray(value.screenshots) ? (value.screenshots as unknown[]).filter((s): s is string => typeof s === "string") : undefined;
	const triggers = parseTriggers(value.triggers, sourcePath);
	const views = parseViews(value.views ?? value.view, sourcePath);
	const script = typeof value.script === "string" && value.script.trim() ? value.script.trim() : undefined;

	return {
		short_name,
		name,
		version,
		description,
		icon,
		screenshots,
		triggers,
		views,
		script,
	};
}

export function parseAddonXml(raw: string, sourcePath: string, meta?: Partial<AddonManifest>): AddonManifest {
	const document = normalizeXmlDocument(raw, sourcePath);
	const rootInner = getXmlContainerInner(document, "addon", sourcePath);
	const nameFromXml = getXmlContainerInner(rootInner, "name", sourcePath, false);
	const name = ensureString(meta?.name ?? (nameFromXml ? normalizeXmlText(nameFromXml).trim() : undefined), "Addon name", sourcePath);
	const versionFromXml = getXmlContainerInner(rootInner, "version", sourcePath, false);
	const version = ensureString(meta?.version ?? (versionFromXml ? normalizeXmlText(versionFromXml).trim() : undefined), "Addon version", sourcePath);
	const descriptionFromXml = getXmlContainerInner(rootInner, "description", sourcePath, false);
	const description = ensureString(meta?.description ?? (descriptionFromXml ? normalizeXmlText(descriptionFromXml).trim() : undefined), "Addon description", sourcePath);
	const triggerSource = getXmlContainerInner(rootInner, "triggers", sourcePath, false) ?? rootInner;
	const triggerElements = Array.from(triggerSource.matchAll(/<trigger(\s[^>]*)?>([\s\S]*?)<\/trigger>/gi));

	if (triggerElements.length === 0) {
		throw new Error(`Addon triggers must include at least one <trigger> at ${sourcePath}.`);
	}

	const triggers = triggerElements.map((match, index) => {
		const attributes = parseXmlAttributes(match[1], `trigger ${index}`, sourcePath);
		assertAllowedKeys(attributes, ["event", "name"], `trigger ${index}`, sourcePath);

		const triggerName = ensureString(attributes.event ?? attributes.name, `Trigger name at index ${index}`, sourcePath);
		const triggerBody = match[2];
		const actionsSource = getXmlContainerInner(triggerBody, "actions", sourcePath, false) ?? triggerBody;
		const commandElements = Array.from(actionsSource.matchAll(/<command>([\s\S]*?)<\/command>/gi));

		if (commandElements.length === 0) {
			throw new Error(`Trigger command must be a non-empty array at ${sourcePath}.`);
		}

		const command = commandElements.map((commandMatch, commandIndex) => ensureString(normalizeXmlText(commandMatch[1]).trim(), `Trigger command ${triggerName}[${commandIndex}]`, sourcePath));

		const inputsSource = getXmlContainerInner(triggerBody, "inputs", sourcePath, false);
		const input = inputsSource ? parseXmlInputDefinitions(inputsSource, `trigger input ${triggerName}`, sourcePath) : undefined;

		return parseTriggerValue(triggerName, { command, input }, sourcePath);
	});

	const viewsSource = getXmlContainerInner(rootInner, "views", sourcePath, false) ?? rootInner;
	const viewElements = Array.from(viewsSource.matchAll(/<view(\s[^>]*)?>([\s\S]*?)<\/view>/gi));
	const views = viewElements.length
		? viewElements.map((match, index) => {
				const attributes = parseXmlAttributes(match[1], `view ${index}`, sourcePath);
				assertAllowedKeys(attributes, ["name"], `view ${index}`, sourcePath);

				return {
					name: ensureString(attributes.name, `View name at index ${index}`, sourcePath),
					content: parseXmlViewContent(match[2], `view ${index}`, sourcePath),
				};
			})
		: undefined;

	// Extract root-level <script> block, ignoring scripts nested inside <view> elements.
	const rootWithoutViews = rootInner.replace(/<views[\s\S]*?<\/views>/gi, "").replace(/<view[\s\S]*?<\/view>/gi, "");
	const rootScriptMatch = rootWithoutViews.match(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/i);
	const script = rootScriptMatch ? normalizeXmlText(rootScriptMatch[1]).trim() || undefined : undefined;

	return {
		short_name: meta?.short_name,
		name,
		version,
		description,
		icon: meta?.icon,
		screenshots: meta?.screenshots,
		triggers,
		views,
		script,
	};
}

function detectAddonFormat(sourcePath: string, raw: string): SupportedAddonFormat {
	const extension = path.extname(sourcePath).toLowerCase();
	if (extension === ".json") {
		return "json";
	}

	if (extension === ".xml") {
		return "xml";
	}

	const trimmed = raw.trim();
	if (trimmed.startsWith("{")) {
		return "json";
	}

	if (trimmed.startsWith("<")) {
		return "xml";
	}

	throw new Error(`Unsupported addon format at ${sourcePath}. Use JSON or XML.`);
}

function isSupportedAddonEntry(entryName: string) {
	const extension = path.extname(entryName).toLowerCase();
	return extension === ".json" || extension === ".xml" || extension === "";
}

function getAddonEntryBaseName(entryName: string) {
	const extension = path.extname(entryName);
	return extension ? entryName.slice(0, -extension.length) : entryName;
}

function getAddonEntryPriority(entryName: string) {
	return path.extname(entryName).toLowerCase() === ".json" ? 0 : 1;
}

function parseAddonFile(raw: string, sourcePath: string, meta?: Partial<AddonManifest>) {
	const format = detectAddonFormat(sourcePath, raw);
	if (format === "json") {
		return parseAddonObject(JSON.parse(raw), sourcePath);
	}

	return parseAddonXml(raw, sourcePath, meta);
}

interface AddonDirectoryManifest {
	short_name?: string;
	name: string;
	version: string;
	description: string;
	icon?: AddonIconDefinition;
	screenshots?: string[];
}

const INDEX_CANDIDATE_NAMES = ["index", "index.xml", "index.json"];

function parseAddonManifestJson(raw: string, sourcePath: string): AddonDirectoryManifest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new Error(`Failed to parse manifest.json as JSON at ${sourcePath}.`);
	}

	if (!isRecord(parsed)) {
		throw new Error(`manifest.json must contain a JSON object at ${sourcePath}.`);
	}

	assertAllowedKeys(parsed, ["short_name", "name", "version", "description", "icon", "screenshots"], "manifest.json", sourcePath);

	return {
		short_name: typeof parsed.short_name === "string" && parsed.short_name.trim() ? parsed.short_name.trim() : undefined,
		name: ensureString(parsed.name, "manifest name", sourcePath),
		version: ensureString(parsed.version, "manifest version", sourcePath),
		description: ensureString(parsed.description, "manifest description", sourcePath),
		icon: isRecord(parsed.icon) ? (parsed.icon as unknown as AddonIconDefinition) : undefined,
		screenshots: Array.isArray(parsed.screenshots) ? (parsed.screenshots as unknown[]).filter((s): s is string => typeof s === "string") : undefined,
	};
}

function loadAddonFromSubdirectory(directoryPath: string, sourceType: LoadedAddon["sourceType"]): LoadedAddon {
	const manifestPath = path.join(directoryPath, "manifest.json");
	const manifestRaw = fs.readFileSync(manifestPath, "utf8");
	const directoryMeta = parseAddonManifestJson(manifestRaw, manifestPath);

	const indexEntry = INDEX_CANDIDATE_NAMES.find((candidate) => fs.existsSync(path.join(directoryPath, candidate)));

	if (!indexEntry) {
		throw new Error(`Addon directory "${directoryPath}" has a manifest.json but no index file (expected one of: ${INDEX_CANDIDATE_NAMES.join(", ")}).`);
	}

	const indexPath = path.join(directoryPath, indexEntry);
	const indexRaw = fs.readFileSync(indexPath, "utf8");
	const addon = parseAddonFile(indexRaw, indexPath, directoryMeta);

	return { addon, sourcePath: directoryPath, sourceType };
}

async function readAddonsFromDirectory(directoryPath: string, sourceType: LoadedAddon["sourceType"]) {
	if (!fs.existsSync(directoryPath)) {
		return [] as LoadedAddon[];
	}

	const warnings: string[] = [];

	const dirents = fs.readdirSync(directoryPath, { withFileTypes: true });

	// Subdirectories with a manifest.json follow the new directory-based addon format
	const dirResults: LoadedAddon[] = dirents
		.filter((entry) => entry.isDirectory() && fs.existsSync(path.join(directoryPath, entry.name, "manifest.json")))
		.flatMap((entry) => {
			const sourcePath = path.join(directoryPath, entry.name);
			try {
				return [loadAddonFromSubdirectory(sourcePath, sourceType)];
			} catch (error) {
				warnings.push(error instanceof Error ? error.message : String(error));
				return [];
			}
		});

	// Flat files follow the legacy single-file addon format
	const entries = dirents
		.filter((entry) => entry.isFile() && isSupportedAddonEntry(entry.name))
		.map((entry) => entry.name)
		.sort((left, right) => {
			const baseComparison = getAddonEntryBaseName(left).localeCompare(getAddonEntryBaseName(right));
			if (baseComparison !== 0) {
				return baseComparison;
			}

			const priorityComparison = getAddonEntryPriority(left) - getAddonEntryPriority(right);
			if (priorityComparison !== 0) {
				return priorityComparison;
			}

			return left.localeCompare(right);
		});

	const fileResults = entries.flatMap((entry) => {
		const sourcePath = path.join(directoryPath, entry);

		try {
			const raw = fs.readFileSync(sourcePath, "utf8");
			const addon = parseAddonFile(raw, sourcePath);

			return [
				{
					addon,
					sourcePath,
					sourceType,
				},
			];
		} catch (error) {
			warnings.push(error instanceof Error ? error.message : String(error));
			return [];
		}
	});

	for (const warning of warnings) {
		console.warn(`[vps-manager] Skipping invalid addon: ${warning}`);
	}

	return [...fileResults, ...dirResults];
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
