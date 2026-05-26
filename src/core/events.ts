import { randomUUID } from "crypto";
import type { Response } from "express";

export interface PanelEvent<T = unknown> {
	id: string;
	type: string;
	timestamp: string;
	payload: T;
}

export class EventStreamHub {
	private readonly clients = new Set<Response>();
	private readonly backlog: PanelEvent[] = [];

	attach(response: Response) {
		response.setHeader("Content-Type", "text/event-stream");
		response.setHeader("Cache-Control", "no-cache, no-transform");
		response.setHeader("Connection", "keep-alive");
		response.flushHeaders();

		this.clients.add(response);

		for (const event of this.backlog) {
			response.write(this.serialize(event));
		}

		response.write(
			this.serialize({
				id: randomUUID(),
				type: "stream:ready",
				timestamp: new Date().toISOString(),
				payload: { ok: true },
			}),
		);

		response.req.on("close", () => {
			this.clients.delete(response);
		});
	}

	emit<T = unknown>(type: string, payload: T) {
		const event: PanelEvent<T> = {
			id: randomUUID(),
			type,
			timestamp: new Date().toISOString(),
			payload,
		};

		this.backlog.push(event);
		if (this.backlog.length > 50) {
			this.backlog.shift();
		}

		const serialized = this.serialize(event);
		for (const client of this.clients) {
			client.write(serialized);
		}
	}

	close() {
		for (const client of this.clients) {
			client.end();
		}

		this.clients.clear();
	}

	private serialize(event: PanelEvent) {
		return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
	}
}
