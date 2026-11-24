import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

const pattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const prefix = "native-v";
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function parse(version) {
  if (!pattern.test(version)) throw new Error(`Expected a stable x.y.z version, got ${version}`);
  const parts = version.split(".").map(Number);
  versionCode(parts);
  return parts;
}

function versionCode([major, minor, patch]) {
  const code = major * 1_000_000 + minor * 1_000 + patch;
  if (minor >= 1000 || patch >= 1000 || !Number.isSafeInteger(code) || code > 2_100_000_000) {
    throw new Error("Version cannot be represented as an Android versionCode");
  }
  return Math.max(code, 1);
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const mode = process.argv[2] ?? "preview";
const baseline = parse(JSON.parse(readFileSync("package.json", "utf8")).version);
let parts = baseline;
if (mode !== "preview") {
  if (!["major", "minor", "patch"].includes(mode)) throw new Error(`Unknown bump: ${mode}`);
  const tags = git("tag", "--list", `${prefix}*`).split("\n").filter(tag => pattern.test(tag.slice(prefix.length)));
  const matchingTags = tags.filter(tag => git("rev-list", "-n", "1", `refs/tags/${tag}`) === git("rev-parse", "HEAD"));
  if (matchingTags.length > 1) throw new Error("Multiple native releases point at this commit");
  if (matchingTags.length === 1) {
    // Resume a failed publication without minting a second tag for the same source.
    parts = parse(matchingTags[0].slice(prefix.length));
  } else {
    const newest = tags.map(tag => parse(tag.slice(prefix.length))).sort(compare).at(-1);
    const floor = newest && compare(newest, baseline) >= 0 ? newest : baseline;
    const position = ["major", "minor", "patch"].indexOf(mode);
    parts = floor.map((part, index) => index < position ? part : index === position ? part + 1 : 0);
  }
}
const version = parts.join(".");
const output = `version=${version}\ntag=${prefix}${version}\nandroid_code=${versionCode(parts)}\n`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
else process.stdout.write(output);
