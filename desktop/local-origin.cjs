const path = require("node:path");

const appUrl = "app://supergeometry/";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: http:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src https: http:",
  "media-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function isLocal(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === "app:" && url.host === "supergeometry" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function assetPath(root, raw) {
  if (!isLocal(raw)) return null;
  let route;
  try {
    route = decodeURIComponent(new URL(raw).pathname);
  } catch {
    return null;
  }
  // Disallow encoded separators that might be interpreted differently by the OS,
  // Windows alternate streams/drive letters, and unsafe path segments.
  if (/[\\:\0]/.test(route) || !route.startsWith("/")) return null;
  const parts = (route === "/" ? "/index.html" : route).slice(1).split("/");
  if (parts.some((p) => !p || p === "." || p === ".." || /[. ]$/.test(p))) return null;
  const file = path.resolve(root, ...parts);
  const relative = path.relative(root, file);
  return relative && relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative) ? file : null;
}

module.exports = { appUrl, assetPath, csp, isLocal };
