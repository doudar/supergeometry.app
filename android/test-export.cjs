// Exercise the same document-start JS adapter injected by MainActivity.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

test("detached blob exports preserve binary bytes and continue after cancelled picker", async () => {
  const origin = "https://appassets.androidplatform.net";
  const prototypeClick = Symbol();
  class Anchor {
    constructor(href, download) { this.href = href; this.download = download; }
    hasAttribute(name) { return name === "download" && this.download !== undefined; }
    click() { return prototypeClick; }
  }
  const bytes = Uint8Array.from({ length: 390_000 }, (_, i) => i % 251);
  const messages = [], alerts = [];
  let finish;
  const done = new Promise((resolve) => { finish = resolve; });
  const native = {
    postMessage(value) {
      const message = JSON.parse(value);
      messages.push(message);
      setImmediate(() => {
        this.onmessage({ data: message.name === "skip.step" ? "cancelled" : "ok" });
        if (message.type === "finish") finish();
      });
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "app/src/main/assets/export.js"), "utf8"), {
    HTMLAnchorElement: Anchor, window: { superGeometryDownloads: native },
    location: { origin }, document: { addEventListener() {} },
    fetch: () => Promise.resolve({ blob: () => new Blob([bytes], { type: "application/step" }) }),
    btoa, setTimeout, clearTimeout, alert: (s) => alerts.push(s),
  });
  assert.equal(new Anchor("blob:https://other.invalid/file", "bad.step").click(), prototypeClick);
  new Anchor("blob:" + origin + "/ignore", "skip.step").click();
  new Anchor("blob:" + origin + "/b", "keep.step").click();
  await done;
  assert.deepEqual(messages.map((m) => m.type), ["open", "open", "chunk", "chunk", "finish"]);
  assert.equal(messages[1].name, "keep.step");
  const reconstructed = Buffer.concat(messages.filter((m) => m.type === "chunk")
    .map((m) => Buffer.from(m.value, "base64")));
  assert.deepEqual(reconstructed, Buffer.from(bytes));
  assert.deepEqual(alerts, []);
});
