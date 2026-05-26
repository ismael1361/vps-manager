import path from "path";

export function getPackageRoot() {
	return path.resolve(__dirname, "..", "..");
}

export function getBuiltInAddonsDir() {
	return path.join(getPackageRoot(), "addons");
}

export function getWorkingDirectoryAddonsDir(cwd: string = process.cwd()) {
	return path.join(cwd, "addons");
}

export function getPublicDir() {
	return path.join(getPackageRoot(), "public");
}
