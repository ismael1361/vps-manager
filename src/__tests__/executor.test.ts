import { EventEmitter } from "events";
import { executePreparedCommands, executePreparedCommandsWithOutput, prepareTriggerExecution } from "../core/executor";

class FakeExecStream extends EventEmitter {
	stderr = new EventEmitter();

	constructor(private readonly plan: { stdout?: string; stderr?: string; code?: number }) {
		super();
	}

	start() {
		queueMicrotask(() => {
			if (this.plan.stdout) {
				this.emit("data", Buffer.from(this.plan.stdout));
			}

			if (this.plan.stderr) {
				this.stderr.emit("data", Buffer.from(this.plan.stderr));
			}

			this.emit("close", this.plan.code ?? 0, undefined);
		});
	}
}

function createFakeExecClient(plans: Array<{ stdout?: string; stderr?: string; code?: number }>) {
	let index = 0;
	const commands: string[] = [];
	return {
		commands,
		exec(command: string, arg2: unknown, arg3?: (error: Error | undefined, stream?: FakeExecStream) => void) {
			const callback = typeof arg2 === "function" ? arg2 : arg3;
			if (!callback) {
				throw new Error("Expected exec callback.");
			}

			commands.push(command);
			const stream = new FakeExecStream(plans[index] || {});
			index += 1;
			callback(undefined, stream);
			stream.start();
			return this;
		},
	};
}

describe("executor", () => {
	it("prepares commands with interpolation and supports quoted multiline content", () => {
		const trigger = {
			name: "create site",
			command: ["printf '%s\\n' '{content}' | sudo tee /etc/nginx/sites-available/{domain} >/dev/null"],
			input: [
				{ name: "domain", type: "text" },
				{ name: "content", type: "text" },
			],
		};

		const prepared = prepareTriggerExecution({
			trigger,
			inputs: {
				domain: "example.com",
				content: "server {\n  listen 80;\n}",
			},
			snapshot: {
				connected: true,
				busy: false,
				capabilities: {
					isRoot: true,
					canUseSudoWithoutPassword: true,
				},
			},
		});

		expect(prepared.commands[0]).toContain("/etc/nginx/sites-available/'example.com'");
		expect(prepared.commands[0]).toContain("server {");
	});

	it("blocks interactive commands in v1", () => {
		expect(() =>
			prepareTriggerExecution({
				trigger: {
					name: "edit site",
					command: ["sudo nano /etc/nginx/sites-available/{domain}"],
					input: [{ name: "domain", type: "text" }],
				},
				inputs: { domain: "example.com" },
				snapshot: {
					connected: true,
					busy: false,
					capabilities: {
						isRoot: true,
						canUseSudoWithoutPassword: true,
					},
				},
			}),
		).toThrow(/Interactive commands/);
	});

	it("validates inputs against regex definitions", () => {
		expect(() =>
			prepareTriggerExecution({
				trigger: {
					name: "create site",
					command: ["echo {domain}"],
					input: [{ name: "domain", type: "text", validation: "^[a-z0-9.-]+$" }],
				},
				inputs: { domain: "https://example.com" },
				snapshot: {
					connected: true,
					busy: false,
					capabilities: {
						isRoot: true,
						canUseSudoWithoutPassword: true,
					},
				},
			}),
		).toThrow(/does not match the required format/);
	});

	it("emits execution events in command order", async () => {
		const events: Array<{ type: string; payload: any }> = [];
		const fakeClient = createFakeExecClient([
			{ stdout: "ran first", code: 0 },
			{ stdout: "ran second", code: 0 },
		]);

		await executePreparedCommands({
			executionId: "exec-1",
			addonName: "nginx",
			triggerName: "status",
			commands: ["echo nginx", "echo ok"],
			session: {
				getSnapshot() {
					return {
						connected: true,
						busy: false,
						capabilities: {
							isRoot: true,
							canUseSudoWithoutPassword: true,
						},
					};
				},
				async runExclusive(task) {
					return task(fakeClient as any);
				},
			},
			events: {
				emit(type, payload) {
					events.push({ type, payload });
				},
			},
		});

		expect(events.map((entry) => entry.type)).toEqual([
			"execution:start",
			"command:start",
			"command:stdout",
			"command:close",
			"command:start",
			"command:stdout",
			"command:close",
			"execution:complete",
		]);
		expect(fakeClient.commands[0]).toContain("bash -ic 'eval \"$__VPSM_COMMAND\"'");
		expect(fakeClient.commands[0]).toContain("export __VPSM_COMMAND='echo nginx'");
	});

	it("captures stdout and stderr for synchronous executions", async () => {
		const fakeClient = createFakeExecClient([{ stdout: "out:echo nginx", stderr: "err:echo nginx", code: 0 }]);

		const result = await executePreparedCommandsWithOutput({
			executionId: "exec-2",
			addonName: "nginx",
			triggerName: "status",
			commands: ["echo nginx"],
			session: {
				getSnapshot() {
					return {
						connected: true,
						busy: false,
						capabilities: {
							isRoot: true,
							canUseSudoWithoutPassword: true,
						},
					};
				},
				async runExclusive(task) {
					return task(fakeClient as any);
				},
			},
		});

		expect(result.stdout).toContain("out:echo nginx");
		expect(result.stderr).toContain("err:echo nginx");
		expect(result.outputs).toHaveLength(1);
		expect(result.outputs[0].command).toBe("echo nginx");
	});

	it("includes stderr details when a command fails", async () => {
		const fakeClient = createFakeExecClient([{ stderr: "nvm: command not found", code: 127 }]);

		await expect(
			executePreparedCommands({
				executionId: "exec-3",
				addonName: "nvm",
				triggerName: "status",
				commands: ["nvm current"],
				session: {
					getSnapshot() {
						return {
							connected: true,
							busy: false,
							capabilities: {
								isRoot: true,
								canUseSudoWithoutPassword: true,
							},
						};
					},
					async runExclusive(task) {
						return task(fakeClient as any);
					},
				},
			}),
		).rejects.toThrow(/nvm: command not found/);
	});
});
