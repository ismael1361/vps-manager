import { EventEmitter } from "events";
import { SessionStore } from "../core/session";

function createDeferred() {
	let resolve!: () => void;
	let reject!: (error?: unknown) => void;
	const promise = new Promise<void>((innerResolve, innerReject) => {
		resolve = innerResolve;
		reject = innerReject;
	});

	return { promise, resolve, reject };
}

class FakeClient extends EventEmitter {
	end() {
		this.emit("close");
		return this;
	}
}

function createConnectedStore() {
	const store = new SessionStore();
	(store as any).client = new FakeClient();
	(store as any).activeSessionId = 1;
	(store as any).snapshot = {
		connected: true,
		busy: false,
		host: "example.com",
		port: 22,
		username: "root",
		authMethod: "password",
		capabilities: {
			isRoot: true,
			canUseSudoWithoutPassword: true,
		},
	};
	return store;
}

describe("SessionStore", () => {
	it("reuses the same cached result within the TTL window", async () => {
		jest.useFakeTimers();

		try {
			const store = createConnectedStore();
			let runs = 0;

			await expect(
				store.runExclusive(
					async () => {
						runs += 1;
						return "first";
					},
					{ cacheKey: "ssh:hostname", cacheTtlMs: 5000 },
				),
			).resolves.toBe("first");

			await expect(
				store.runExclusive(
					async () => {
						runs += 1;
						return "second";
					},
					{ cacheKey: "ssh:hostname", cacheTtlMs: 5000 },
				),
			).resolves.toBe("first");

			expect(runs).toBe(1);

			jest.advanceTimersByTime(5001);

			await expect(
				store.runExclusive(
					async () => {
						runs += 1;
						return "third";
					},
					{ cacheKey: "ssh:hostname", cacheTtlMs: 5000 },
				),
			).resolves.toBe("third");

			expect(runs).toBe(2);
		} finally {
			jest.useRealTimers();
		}
	});

	it("deduplicates concurrent identical cached tasks", async () => {
		const store = createConnectedStore();
		const gate = createDeferred();
		let runs = 0;

		const first = store.runExclusive(
			async () => {
				runs += 1;
				await gate.promise;
				return "same-result";
			},
			{ cacheKey: "ssh:cat /etc/os-release", cacheTtlMs: 5000 },
		);

		const second = store.runExclusive(
			async () => {
				runs += 1;
				return "different-result";
			},
			{ cacheKey: "ssh:cat /etc/os-release", cacheTtlMs: 5000 },
		);

		await Promise.resolve();
		expect(runs).toBe(1);

		gate.resolve();

		await expect(Promise.all([first, second])).resolves.toEqual(["same-result", "same-result"]);
		expect(runs).toBe(1);
	});

	it("queues concurrent triggers in FIFO order", async () => {
		const store = createConnectedStore();
		const firstGate = createDeferred();
		const events: string[] = [];

		const first = store.runExclusive(async () => {
			events.push("first:start");
			await firstGate.promise;
			events.push("first:end");
			return "first";
		});

		const second = store.runExclusive(async () => {
			events.push("second:start");
			events.push("second:end");
			return "second";
		});

		const third = store.runExclusive(async () => {
			events.push("third:start");
			events.push("third:end");
			return "third";
		});

		await Promise.resolve();

		expect(events).toEqual(["first:start"]);
		expect(store.getSnapshot().busy).toBe(true);

		firstGate.resolve();

		await expect(Promise.all([first, second, third])).resolves.toEqual(["first", "second", "third"]);
		expect(events).toEqual(["first:start", "first:end", "second:start", "second:end", "third:start", "third:end"]);
		expect(store.getSnapshot().busy).toBe(false);
	});

	it("rejects queued triggers when the session disconnects", async () => {
		const store = createConnectedStore();
		const firstGate = createDeferred();

		const first = store.runExclusive(async () => {
			await firstGate.promise;
			return "first";
		});

		const second = store.runExclusive(async () => "second");

		await Promise.resolve();
		await store.disconnect();
		firstGate.resolve();

		await expect(first).resolves.toBe("first");
		await expect(second).rejects.toThrow("SSH session was disconnected.");
		expect(store.getSnapshot().busy).toBe(false);
	});
});
