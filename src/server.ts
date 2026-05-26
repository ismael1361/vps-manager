import express, { type Request, type Response } from "express";
import http from "http";
import fs from "fs";
import path from "path";
import open from "open";
import net from "net";

export interface StartServerOptions {
    host?: string;
    preferredPort?: number;
    autoOpen?: boolean;
}

export interface StartedServer {
    app: express.Express;
    server: http.Server;
    host: string;
    port: number;
    url: string;
    close(): Promise<void>;
}

const DEFAULT_PORT = 3000;
const MAX_PORT = 3100;
const PUBLIC_DIR = path.resolve(__dirname, "../public");

async function isPortAvailable(port: number, host: string) {
    return new Promise<boolean>((resolve, reject) => {
        const server = net.createServer();

        server.once("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE") {
                resolve(false);
                return;
            }

            reject(error);
        });

        server.listen(port, host, () => {
            server.close(() => resolve(true));
        });
    });
}

async function findAvailablePort(startPort: number, endPort: number, host: string) {
    for (let port = startPort; port <= endPort; port += 1) {
        if (await isPortAvailable(port, host)) {
            return port;
        }
    }

    return null;
}

function getBaseUrl(server: http.Server, requestedHost: string) {
    const address = server.address();

    if (!address || typeof address === "string") {
        return `http://${requestedHost}`;
    }

    const bindHost = address.address === "::" || address.address === "0.0.0.0" ? "localhost" : address.address;
    const host = bindHost.includes(":") && !bindHost.startsWith("[") ? `[${bindHost}]` : bindHost;

    return `http://${host}:${address.port}`;
}

function createApp() {
    const app = express();

    app.use(express.json());

    app.get("/api/health", (_req: Request, res: Response) => {
        res.json({
            ok: true,
            service: "vps-manager",
            timestamp: new Date().toISOString(),
        });
    });

    if (fs.existsSync(PUBLIC_DIR)) {
        app.use(express.static(PUBLIC_DIR));
    }

    app.get("*", (_req: Request, res: Response) => {
        const indexPath = path.join(PUBLIC_DIR, "index.html");
        if (!fs.existsSync(indexPath)) {
            res.status(404).json({ message: "UI not built yet." });
            return;
        }

        res.sendFile(indexPath);
    });

    return app;
}

export async function startServer(options: StartServerOptions = {}): Promise<StartedServer> {
    const host = options.host || "127.0.0.1";
    const requestedPort = options.preferredPort || DEFAULT_PORT;
    const port = (await findAvailablePort(requestedPort, MAX_PORT, host)) ?? requestedPort;
    const app = createApp();
    const server = http.createServer(app);

    await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => resolve());
    });

    const url = getBaseUrl(server, host);
    console.log(`VPS Manager listening on ${url}`);

    if (options.autoOpen !== false) {
        await open(url);
    }

    return {
        app,
        server,
        host,
        port,
        url,
        async close() {
            await new Promise<void>((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                });
            });
        },
    };
}
