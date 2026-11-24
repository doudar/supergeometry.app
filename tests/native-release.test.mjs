import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/native-release.mjs", import.meta.url));
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "sg-release-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const options = { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
  const git = (...args) => execFileSync("git", args, options);
  const commit = () => git("-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "--allow-empty", "-qm", "test");
  const run = mode => Object.fromEntries(execFileSync(process.execPath, [script, mode], {
    ...options, env: { ...process.env, GITHUB_OUTPUT: "" },
  }).trim().split("\n").map(line => line.trimEnd().split("=")));
  const baseline = version => writeFileSync(join(cwd, "package.json"), JSON.stringify({ version }));
  git("init", "-q");
  commit();
  baseline("0.6.0");
  return { git, commit, run, baseline };
}

test("first bump and package metadata agree, unrelated tags don't matter", t => {
  const { git, run } = fixture(t);
  git("tag", "v99.0.0");
  assert.deepEqual(run("preview"), { version: "0.6.0", tag: "native-v0.6.0", android_code: "6000" });
  assert.deepEqual(run("patch"), { version: "0.6.1", tag: "native-v0.6.1", android_code: "6001" });
});

test("publication retries are idempotent and the next source increments numerically", t => {
  const { git, commit, run } = fixture(t);
  git("tag", "native-v0.9.1");
  commit();
  git("tag", "native-v0.10.0");
  assert.equal(run("major").tag, "native-v0.10.0");
  commit();
  assert.equal(run("patch").tag, "native-v0.10.1");
  assert.equal(run("minor").tag, "native-v0.11.0");
  assert.equal(run("major").tag, "native-v1.0.0");
});

test("a newer web baseline wins; overflowing Android version codes fail", t => {
  const { git, commit, run, baseline } = fixture(t);
  git("tag", "native-v0.9.999");
  commit();
  assert.throws(() => run("patch"), /Android versionCode/);
  baseline("0.12.0");
  assert.equal(run("patch").android_code, "12001");
});
