// The app also downloads through detached anchors, which don't bubble to document.
(() => {
  const nativeClick = HTMLAnchorElement.prototype.click;
  const send = window.superGeometryDownloads;
  const limit = 32 * 1024 * 1024;
  const chunkSize = 192 * 1024;
  let queue = Promise.resolve();
  let pending;
  send.onmessage = ({ data }) => {
    if (pending) {
      const settle = pending;
      pending = undefined;
      clearTimeout(settle.timer);
      data === "ok" ? settle.resolve() : settle.reject(new Error(data));
    }
  };
  function post(payload) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending = undefined;
        reject(new Error("Android stopped responding"));
      }, 300000);
      pending = { resolve, reject, timer };
      send.postMessage(JSON.stringify(payload));
    });
  }
  function canSave(anchor) {
    return anchor.hasAttribute("download") && anchor.href.startsWith("blob:" + location.origin + "/");
  }
  function save(anchor) {
    const name = anchor.download || "superGeometry-export";
    // Start fetching before upstream revokes the blob URL, even if the picker is busy.
    const contents = fetch(anchor.href).then((r) => r.blob()).then(
      (blob) => ({ blob }), (error) => ({ error })
    );
    queue = queue.then(async () => {
      const { blob, error } = await contents;
      if (error) throw error;
      if (blob.size > limit) throw new Error("The Android preview supports exports up to 32 MiB");
      await post({ type: "open", name, size: blob.size, mime: blob.type });
      for (let offset = 0; offset < blob.size; offset += chunkSize) {
        const bytes = new Uint8Array(await blob.slice(offset, offset + chunkSize).arrayBuffer());
        let text = "";
        for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
        await post({ type: "chunk", value: btoa(text) });
      }
      await post({ type: "finish" });
    }).catch((error) => {
      if (error.message !== "cancelled") alert("Unable to save export: " + error.message);
    });
  }
  HTMLAnchorElement.prototype.click = function () {
    if (canSave(this)) save(this);
    else return nativeClick.call(this);
  };
  document.addEventListener("click", (event) => {
    const anchor = event.target.closest?.("a[download]");
    if (anchor && canSave(anchor) && !event.defaultPrevented) {
      event.preventDefault();
      save(anchor);
    }
  });
})();
