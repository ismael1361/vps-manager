import { type ClientChannel } from "ssh2";
import { type AddonTriggerDefinition } from "./addon";
import { type EventStreamHub } from "./events";
import { type RemoteExecClient, type SessionSnapshot, type SessionStore } from "./session";

export interface PreparedTriggerExecution {
	commands: string[];
	warnings: string[];
	referencedInputs: string[];
}

export interface PrepareTriggerExecutionOptions {
	trigger: AddonTriggerDefinition;
	inputs?: Record<string, string>;
	snapshot?: SessionSnapshot;
}

export interface ExecutePreparedCommandsOptions {
	executionId: string;
	addonName: string;
	triggerName: string;
	commands: string[];
	session: Pick<SessionStore, "runExclusive" | "getSnapshot">;
	events?: Pick<EventStreamHub, "emit">;
}

export interface CapturedCommandOutput {
	command: string;
	stdout: string;
	stderr: string;
	code: number | null;
	signal?: string;
}

export interface CapturedPreparedCommandsResult {
	outputs: CapturedCommandOutput[];
	stdout: string;
	stderr: string;
}

interface CommandResult {
	stdout: string;
	stderr: string;
	code: number | null;
	signal?: string;
}

const INTERACTIVE_PATTERN = /(^|\s)(nano|vim|vi|less|more|top|htop|watch|passwd|su)(\s|$)/i;

function escapeForSingleQuotedValue(value: string) {
	return value.replace(/'/g, `'"'"'`);
}

function escapeForDoubleQuotedValue(value: string) {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

function shellQuote(value: string) {
	return `'${escapeForSingleQuotedValue(value)}'`;
}

function collectReferencedInputs(trigger: AddonTriggerDefinition) {
	const names = new Set<string>();
	const expression = /\{([a-zA-Z0-9_-]+)\}/g;

	for (const command of trigger.command) {
		for (const match of command.matchAll(expression)) {
			names.add(match[1]);
		}
	}

	return Array.from(names);
}

export function interpolateCommand(command: string, inputs: Record<string, string>) {
	let result = command;

	for (const [name, value] of Object.entries(inputs)) {
		const token = `{${name}}`;
		result = result.split(`'${token}'`).join(`'${escapeForSingleQuotedValue(value)}'`);
		result = result.split(`"${token}"`).join(`"${escapeForDoubleQuotedValue(value)}"`);
		result = result.split(token).join(shellQuote(value));
	}

	return result;
}

function assessCommandPlan(commands: string[], snapshot?: SessionSnapshot) {
	const warnings: string[] = [];

	for (const command of commands) {
		if (INTERACTIVE_PATTERN.test(command)) {
			throw new Error(`Interactive commands are not supported in V1: ${command}`);
		}

		if (/\bsudo\b/.test(command)) {
			if (!snapshot?.connected) {
				warnings.push("This trigger uses sudo. Connect first to validate whether the remote session can run sudo without a password prompt.");
				continue;
			}

			if (!snapshot.capabilities?.isRoot && !snapshot.capabilities?.canUseSudoWithoutPassword) {
				throw new Error("This trigger uses sudo, but the current SSH session cannot run sudo without a password prompt. Use root or configure NOPASSWD.");
			}
		}
	}

	return warnings;
}

function validateTriggerInputs(trigger: AddonTriggerDefinition, inputs: Record<string, string>) {
	for (const inputDefinition of trigger.input || []) {
		if (inputs[inputDefinition.name] === undefined) {
			throw new Error(`Missing required input "${inputDefinition.name}".`);
		}

		if (!inputDefinition.validation) {
			continue;
		}

		let expression: RegExp;
		try {
			expression = new RegExp(inputDefinition.validation);
		} catch (error) {
			throw new Error(`Invalid validation pattern for input "${inputDefinition.name}": ${error instanceof Error ? error.message : String(error)}`);
		}

		if (!expression.test(inputs[inputDefinition.name])) {
			throw new Error(`Input "${inputDefinition.name}" does not match the required format.`);
		}
	}
}

export function prepareTriggerExecution(options: PrepareTriggerExecutionOptions): PreparedTriggerExecution {
	const inputs = options.inputs || {};
	const referencedInputs = collectReferencedInputs(options.trigger);

	validateTriggerInputs(options.trigger, inputs);

	for (const name of referencedInputs) {
		if (inputs[name] === undefined) {
			throw new Error(`Missing placeholder value for "${name}".`);
		}
	}

	const commands = options.trigger.command.map((command) => interpolateCommand(command, inputs));
	const warnings = assessCommandPlan(commands, options.snapshot);

	return {
		commands,
		warnings,
		referencedInputs,
	};
}

function runRemoteCommand(client: RemoteExecClient, command: string, events: ExecutePreparedCommandsOptions["events"], executionId: string, index: number) {
	return new Promise<CommandResult>((resolve, reject) => {
		client.exec(command, (error, stream) => {
			if (error) {
				reject(error);
				return;
			}

			let stdout = "";
			let stderr = "";

			(stream as ClientChannel).on("data", (chunk: Buffer | string) => {
				const text = chunk.toString();
				stdout += text;
				events?.emit("command:stdout", { executionId, index, chunk: text });
			});

			(stream as ClientChannel).stderr.on("data", (chunk: Buffer | string) => {
				const text = chunk.toString();
				stderr += text;
				events?.emit("command:stderr", { executionId, index, chunk: text });
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

async function executeCommandSequence(options: ExecutePreparedCommandsOptions) {
	const snapshot = options.session.getSnapshot();
	assessCommandPlan(options.commands, snapshot);

	return options.session.runExclusive(async (client) => {
		options.events?.emit("execution:start", {
			executionId: options.executionId,
			addonName: options.addonName,
			triggerName: options.triggerName,
			commandCount: options.commands.length,
		});

		const outputs: CapturedCommandOutput[] = [];

		for (const [index, command] of options.commands.entries()) {
			options.events?.emit("command:start", {
				executionId: options.executionId,
				index,
				command,
			});

			const result = await runRemoteCommand(client, command, options.events, options.executionId, index);
			outputs.push({
				command,
				stdout: result.stdout,
				stderr: result.stderr,
				code: result.code,
				signal: result.signal,
			});

			options.events?.emit("command:close", {
				executionId: options.executionId,
				index,
				code: result.code,
				signal: result.signal,
			});

			if (result.code !== 0) {
				throw new Error(`Command failed with exit code ${result.code ?? "unknown"}: ${command}`);
			}
		}

		options.events?.emit("execution:complete", {
			executionId: options.executionId,
			addonName: options.addonName,
			triggerName: options.triggerName,
		});

		return outputs;
	});
}

export async function executePreparedCommands(options: ExecutePreparedCommandsOptions) {
	try {
		await executeCommandSequence(options);
	} catch (error) {
		options.events?.emit("execution:error", {
			executionId: options.executionId,
			addonName: options.addonName,
			triggerName: options.triggerName,
			message: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

export async function executePreparedCommandsWithOutput(options: ExecutePreparedCommandsOptions): Promise<CapturedPreparedCommandsResult> {
	try {
		const outputs = await executeCommandSequence(options);

		return {
			outputs,
			stdout: outputs.map((entry) => entry.stdout).join(""),
			stderr: outputs.map((entry) => entry.stderr).join(""),
		};
	} catch (error) {
		options.events?.emit("execution:error", {
			executionId: options.executionId,
			addonName: options.addonName,
			triggerName: options.triggerName,
			message: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}
