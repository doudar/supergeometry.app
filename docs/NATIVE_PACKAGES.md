# Native preview packages

Windows and macOS use an Electron shell around the production Vite build.
Android uses a separate Android System WebView shell because Electron does not
target Android. Both bundle the CAD worker and OpenCascade WebAssembly; a
browser tab, remote server or network connection is not needed for modeling.

## Build locally

Use Node 24 at the repository root:

```sh
npm ci
npm run build
node --test tests/native-release.test.mjs
```

On Windows, after the web build:

```sh
npm ci --prefix desktop
npm test --prefix desktop
npm run --prefix desktop package -- --win --x64
```

On macOS, use the same install and test commands, then choose
`npm run --prefix desktop package -- --mac --arm64` (Apple silicon) or
`npm run --prefix desktop package -- --mac --x64` (Intel).
The installer goes to `desktop/release/`.

On Android, install JDK 17, Gradle 8.11.1 and Android SDK Platform/Build Tools
35. With `ANDROID_HOME` set, run the following from the root after the web build:

```sh
node --test android/test-export.cjs
gradle -p android assembleDebug -PappVersion=0.6.0 -PappVersionCode=6000
```

The debug APK is `android/app/build/outputs/apk/debug/app-debug.apk`.
A fresh CI debug key is only appropriate for a sideload preview, and replacing
a build signed by a different key may require uninstalling the old preview.
Export projects first; uninstalling can remove local autosave data.

## GitHub Actions and releases

The **Native packages** workflow builds Windows x64, macOS arm64 and Intel,
and an Android debug APK. PR builds produce downloadable Actions artifacts,
not releases. To publish, run the workflow from the default branch, check
**Publish a GitHub prerelease from the default branch**, and choose a patch,
minor or major increment. Versions use the greater of the web package
version and the highest `native-vX.Y.Z` tag as the baseline. Rerunning for a
commit that already has a native tag reuses that tag. This does not bump the
web package manifest or publish to any app store.

For testing before an upstream merge, a fork maintainer can explicitly push to
the fork's `native-release-preview` branch with Actions enabled. A successful
run publishes a patch-level prerelease in that fork only. The
`native-packaging` branch builds without publishing. The release job runs only
after the full build matrix passes and attaches all four packages and a SHA-256
checksum file to one prerelease. Never use a privileged workflow to build
untrusted PR code.

On each target, test the installed build with networking off: sketch and extrude
a simple part, save a `.super` file and reopen it, and export a STEP file that
opens in another CAD program. Check autosave after relaunch and any platform
file picker or download behavior. Building a package is not an install test.
