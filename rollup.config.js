const resolve = require("@rollup/plugin-node-resolve");
const commonjs = require("@rollup/plugin-commonjs");
const typescript = require("@rollup/plugin-typescript");
const json = require("@rollup/plugin-json");
const currentPackage = require("./package.json");
const fs = require("fs");

const dependencies = [
    ...Object.keys(currentPackage?.dependencies || {}),
    ...Object.keys(currentPackage?.peerDependencies || {}),
    ...Object.keys(currentPackage?.optionalDependencies || {}),
    ...Object.keys(currentPackage?.devDependencies || {}),
];

const files = fs
    .readdirSync("./src")
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `./src/${file}`);

module.exports = {
    input: files,
    output: [
        {
            format: "cjs",
            sourcemap: true,
            dir: "dist",
            preserveModules: true,
            preserveModulesRoot: "src",
            entryFileNames: "[name].js",
        },
        {
            dir: "dist",
            format: "esm",
            preserveModules: true,
            preserveModulesRoot: "src",
            entryFileNames: "[name].esm.js",
            sourcemap: true,
        },
    ],
    plugins: [
        resolve({
            preferBuiltins: true,
        }),
        commonjs(),
        json(),
        typescript({
            tsconfig: "./tsconfig.json",
            sourceMap: true,
        }),
    ],
    external: [...dependencies],
};
