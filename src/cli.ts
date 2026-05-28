#!/usr/bin/env node
import { Command } from "commander";
import { startServer } from "./server";

const program = new Command();

function parsePort(value: string) {
	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`Invalid port: ${value}`);
	}

	return parsed;
}

function readBooleanEnv(name: string) {
	const raw = process.env[name];
	if (raw == null) {
		return undefined;
	}

	if (raw === "" || /^(1|true|yes|on)$/i.test(raw)) {
		return true;
	}

	if (/^(0|false|no|off)$/i.test(raw)) {
		return false;
	}

	return undefined;
}

function readNumberEnv(name: string) {
	const raw = process.env[name];
	if (!raw) {
		return undefined;
	}

	try {
		return parsePort(raw);
	} catch {
		return undefined;
	}
}

program
	.name("vps-manager")
	.description("Start a local VPS manager panel")
	.version("0.1.0")
	.argument("[port]", "Preferred local port as positional argument", parsePort)
	.option("-p, --port <port>", "Preferred local port", parsePort)
	.option("-H, --host <host>", "Local host", "127.0.0.1")
	.option("--no-open", "Do not open the browser automatically")
	.action(async (portArgument, options) => {
		const envPort = readNumberEnv("npm_config_port");
		const envOpen = readBooleanEnv("npm_config_open");
		const envNoOpen = readBooleanEnv("npm_config_no_open");

		const preferredPort = Number.isFinite(options.port) ? options.port : Number.isFinite(portArgument) ? portArgument : envPort;

		const autoOpen = envNoOpen === true ? false : envOpen === false ? false : options.open;

		await startServer({
			host: options.host,
			preferredPort,
			autoOpen,
		});
	});

program.parseAsync(process.argv).catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
