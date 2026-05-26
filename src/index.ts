import { startServer, type StartServerOptions, type StartedServer } from "./server";

export type { StartServerOptions, StartedServer } from "./server";

export async function start(options: StartServerOptions = {}): Promise<StartedServer> {
    return startServer(options);
}

if (require.main === module) {
    start().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
