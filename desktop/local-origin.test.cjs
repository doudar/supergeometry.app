const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { appUrl, assetPath, isLocal } = require("./local-origin.cjs");

const root = path.resolve(__dirname, "../dist");

test("resolves the app document and worker/WASM assets from the bundle", () => {
  assert.equal(assetPath(root, appUrl), path.join(root, "index.html"));
  assert.equal(assetPath(root, appUrl + "assets/kernel.wasm?v=2"), path.join(root, "assets", "kernel.wasm"));
  assert.equal(assetPath(root, appUrl + "assets/worker.js"), path.join(root, "assets", "worker.js"));
});

test("does not serve another origin or paths outside the bundle", () => {
  const invalid = [
    "file:///etc/passwd", "https://supergeometry/index.html",
    "app://supergeometry.example/index.html", "app://supergeometry:80/index.html",
    "app://username@supergeometry/", "app://supergeometry/%2e%2e%2fsecret",
    "app://supergeometry/..%5Csecret", "app://supergeometry/C:%2ffoo",
    "app://supergeometry/%00", "app://supergeometry/%zz",
    "app://supergeometry/..%20/name", "app://supergeometry/windows.txt:stream",
  ];
  for (const url of invalid) assert.equal(assetPath(root, url), null, url);
  assert.equal(isLocal("https://supergeometry.app/"), false);
});
