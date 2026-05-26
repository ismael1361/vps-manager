import { startServer, createApp, type StartServerOptions, type StartedServer } from "./server";

export type { StartServerOptions, StartedServer } from "./server";
export { createApp } from "./server";

export async function start(options: StartServerOptions = {}): Promise<StartedServer> {
	return startServer(options);
}
