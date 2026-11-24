const { app, BrowserWindow, net, protocol, session, shell } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { appUrl, assetPath, csp, isLocal } = require("./local-origin.cjs");

protocol.registerSchemesAsPrivileged([{
  scheme: "app",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
}]);

let mainWindow;

function createWindow() {
  const window = mainWindow = new BrowserWindow({
    title: "superGeometry",
    width: 1280,
    height: 900,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });

  window.on("closed", () => { mainWindow = undefined; });

  // Project browsing and download/save stay in the existing UI. Never navigate
  // the app window to remote pages or give a popup access to the app session.
  window.webContents.on("will-navigate", (event) => {
    if (!isLocal(event.url)) event.preventDefault();
  });
  window.webContents.on("will-redirect", (event) => {
    if (event.isMainFrame && !isLocal(event.url)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  void window.loadURL(appUrl).catch((error) => {
    console.error("Could not load the bundled superGeometry UI:", error);
    app.exit(1);
  });
}

app.whenReady().then(() => {
  const webRoot = app.isPackaged ? path.join(process.resourcesPath, "web") : path.resolve(__dirname, "../dist");
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);

  protocol.handle("app", async (request) => {
    if (request.method !== "GET") return new Response(null, { status: 405 });
    const file = assetPath(webRoot, request.url);
    if (!file) return new Response(null, { status: 404 });
    try {
      const response = await net.fetch(pathToFileURL(file).href);
      const headers = new Headers(response.headers);
      if (path.extname(file) === ".wasm") headers.set("Content-Type", "application/wasm");
      headers.set("Content-Security-Policy", csp);
      headers.set("X-Content-Type-Options", "nosniff");
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
  createWindow();
  app.on("activate", () => {
    if (!mainWindow) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
