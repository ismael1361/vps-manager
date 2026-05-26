#!/usr/bin/env node
import { Command } from "commander";
import { startServer } from "./server";

const program = new Command();

program
    .name("vps-manager")
    .description("Start a local VPS manager panel")
    .version("0.1.0")
    .option("-p, --port <port>", "Preferred local port", (value) => Number.parseInt(value, 10))
    .option("-H, --host <host>", "Local host", "127.0.0.1")
    .option("--no-open", "Do not open the browser automatically")
    .action(async (options) => {
        await startServer({
            host: options.host,
            preferredPort: Number.isFinite(options.port) ? options.port : undefined,
            autoOpen: options.open,
        });
    });

program.parseAsync(process.argv).catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
