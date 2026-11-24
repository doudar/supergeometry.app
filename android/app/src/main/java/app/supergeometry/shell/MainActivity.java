package app.supergeometry.shell;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + HOST;
    private static final String PAGE = ORIGIN + "/web/index.html";
    private static final String CSP = "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; "
        + "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; "
        + "connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'none'; "
        + "media-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'none'";
    private static final int OPEN = 1, SAVE = 2;
    private static final int LIMIT = 32 * 1024 * 1024, CHUNK = 192 * 1024;
    private final ExecutorService disk = Executors.newSingleThreadExecutor();
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private Export export;
    private boolean destroyed;

    private static final class Export {
        final long size;
        final JavaScriptReplyProxy reply;
        long written;
        OutputStream out;
        boolean ready, busy;
        Export(long size, JavaScriptReplyProxy reply) { this.size = size; this.reply = reply; }
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        FrameLayout frame = new FrameLayout(this);
        frame.setFitsSystemWindows(true);
        frame.addView(web, new FrameLayout.LayoutParams(-1, -1));
        setContentView(frame);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);

        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/web/", this::asset)
            .build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!local(request.getUrl())) return denied();
                WebResourceResponse result = loader.shouldInterceptRequest(request.getUrl());
                return result == null ? denied() : result;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (PAGE.equals(uri.toString())) return false;
                if (request.isForMainFrame() && request.hasGesture() && !local(uri)
                        && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (android.content.ActivityNotFoundException ignored) { }
                }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                                       FileChooserParams params) {
                if (!PAGE.equals(view.getUrl()) || chooser != null) {
                    callback.onReceiveValue(null);
                    return true;
                }
                chooser = callback;
                try { startActivityForResult(params.createIntent(), OPEN); }
                catch (android.content.ActivityNotFoundException e) {
                    chooser = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)
                && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addWebMessageListener(web, "superGeometryDownloads",
                Collections.singleton(ORIGIN), (view, message, origin, mainFrame, reply) -> {
                    if (mainFrame && local(origin) && PAGE.equals(view.getUrl())) {
                        onExportMessage(message.getData(), reply);
                    }
                });
            try (InputStream input = getAssets().open("export.js")) {
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[4096];
                for (int count; (count = input.read(buffer)) != -1;) bytes.write(buffer, 0, count);
                String script = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
                WebViewCompat.addDocumentStartJavaScript(web, script, Collections.singleton(ORIGIN));
            } catch (IOException e) { throw new IllegalStateException("Missing Android export adapter", e); }
        } else {
            Toast.makeText(this, "Update Android System WebView to enable saving files", Toast.LENGTH_LONG).show();
        }
        web.loadUrl(PAGE);
    }

    private static boolean local(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && uri.getPort() == -1 && uri.getUserInfo() == null;
    }

    private WebResourceResponse asset(String path) {
        // Only compiled, bundled renderer assets are allowed at this origin.
        for (String part : path.split("/", -1)) {
            if (part.isEmpty() || part.equals(".") || part.equals("..") || part.contains("\\")) return denied();
        }
        String extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        String type;
        switch (extension) {
            case "wasm": type = "application/wasm"; break;
            case "js": case "mjs": type = "text/javascript"; break;
            case "webmanifest": type = "application/manifest+json"; break;
            default: type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        }
        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Security-Policy", CSP);
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(type == null ? "application/octet-stream" : type,
                null, 200, "OK", headers,
                getAssets().open("web/" + path));
        } catch (IOException e) { return denied(); }
    }

    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
            Collections.emptyMap(), null);
    }

    private void onExportMessage(String data, JavaScriptReplyProxy reply) {
        try {
            if (data == null || data.length() > CHUNK * 4 / 3 + 1024) {
                reply.postMessage("Invalid export message");
                return;
            }
            JSONObject request = new JSONObject(data);
            switch (request.getString("type")) {
                case "open":
                    if (export != null) { reply.postMessage("Save already in progress"); return; }
                    long size = request.getLong("size");
                    if (size < 0 || size > LIMIT) { reply.postMessage("Invalid export size"); return; }
                    String name = request.getString("name").replaceAll("[/\\\\\\p{Cntrl}]", "_").trim();
                    if (name.isEmpty()) name = "superGeometry-export";
                    if (name.length() > 200) name = name.substring(0, 200);
                    String mime = request.optString("mime");
                    if (!mime.matches("[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+")) mime = "application/octet-stream";
                    export = new Export(size, reply);
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name);
                    startActivityForResult(intent, SAVE);
                    break;
                case "chunk": {
                    Export job = export;
                    if (job == null || !job.ready || job.busy) { reply.postMessage("No active save"); return; }
                    byte[] chunk = Base64.decode(request.getString("value"), Base64.DEFAULT);
                    if (chunk.length == 0 || chunk.length > CHUNK || chunk.length + job.written > job.size) {
                        fail(job, "Invalid export data");
                        return;
                    }
                    job.busy = true;
                    disk.execute(() -> {
                        try {
                            job.out.write(chunk);
                            runOnUiThread(() -> {
                                if (destroyed) return;
                                job.written += chunk.length;
                                job.busy = false;
                                reply.postMessage("ok");
                            });
                        } catch (IOException e) { runOnUiThread(() -> fail(job, "Could not write file")); }
                    });
                    break;
                }
                case "finish": {
                    Export job = export;
                    if (job == null || !job.ready || job.busy) { reply.postMessage("No active save"); return; }
                    if (job.written != job.size) { fail(job, "Incomplete export"); return; }
                    job.busy = true;
                    disk.execute(() -> {
                        try {
                            job.out.close();
                            job.out = null;
                            runOnUiThread(() -> {
                                if (destroyed) return;
                                export = null;
                                reply.postMessage("ok");
                            });
                        } catch (IOException e) { runOnUiThread(() -> fail(job, "Could not finish file")); }
                    });
                    break;
                }
                default: reply.postMessage("Unknown export operation");
            }
        } catch (Exception e) {
            if (export != null) fail(export, "Unable to save this export");
            else reply.postMessage("Unable to save this export");
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent intent) {
        super.onActivityResult(request, result, intent);
        if (request == OPEN && chooser != null) {
            ValueCallback<Uri[]> callback = chooser;
            chooser = null;
            callback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, intent));
        } else if (request == SAVE && export != null) {
            Export job = export;
            Uri uri = result == RESULT_OK && intent != null ? intent.getData() : null;
            if (uri == null || !"content".equals(uri.getScheme())) { fail(job, "cancelled"); return; }
            disk.execute(() -> {
                try {
                    OutputStream out = getContentResolver().openOutputStream(uri, "w");
                    if (out == null) throw new IOException("No output stream");
                    job.out = new BufferedOutputStream(out);
                    runOnUiThread(() -> {
                        if (destroyed) return;
                        job.ready = true;
                        job.reply.postMessage("ok");
                    });
                } catch (IOException | SecurityException e) {
                    runOnUiThread(() -> fail(job, "Could not open the selected file"));
                }
            });
        }
    }

    private void fail(Export job, String reason) {
        if (destroyed || export != job) return;
        export = null;
        disk.execute(() -> close(job));
        job.reply.postMessage(reason);
    }

    private static void close(Export job) {
        try { if (job.out != null) job.out.close(); }
        catch (IOException ignored) { }
        job.out = null;
    }

    @Override protected void onDestroy() {
        destroyed = true;
        if (chooser != null) chooser.onReceiveValue(null);
        Export job = export;
        if (job != null) disk.execute(() -> close(job));
        disk.shutdown();
        web.destroy();
        super.onDestroy();
    }
}
