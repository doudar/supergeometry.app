const { spawnSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

const version = process.env.SG_RELEASE_VERSION ?? require("../package.json").version;
if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error("SG_RELEASE_VERSION must be major.minor.patch");
}
if (!existsSync(path.join(__dirname, "../dist/index.html"))) {
  throw new Error("Run npm run build at the repository root before packaging.");
}
const result = spawnSync(
  process.execPath,
  [
    require.resolve("electron-builder/out/cli/cli.js"),
    ...process.argv.slice(2),
    `--config.extraMetadata.version=${version}`,
    "--publish", "never",
  ],
  { cwd: __dirname, stdio: "inherit" }
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
