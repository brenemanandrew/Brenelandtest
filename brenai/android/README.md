# Brenai Android app (the neckband)

The app is VITURE's `glasses-demo-android` (from the VITURE XR Glasses SDK for Android, on Andrew's Drive and in `C:\Viture`) with Brenai's own files added. VITURE's source and libraries are not in this repo (licensed); only Brenai's files are here.

What the app does: the setup screen is VITURE's demo (connect the glasses, pick 3DOF or 6DOF). Once tracking starts it opens `GameActivity`: brenai.fly.dev full screen in a web view, with `window.BrenaiNative.pose()` giving the page the glasses' pose every frame (`stereo.js` `native()`). Everything else still comes from the server. `KeepAlive` is a foreground service; `PoseServer` also serves the pose on ws://127.0.0.1:8766 for Chrome (that route did not reach Chrome on the neckband, 2026-11-26).

To rebuild (done in a cloud session, 2026-11-26):
1. Unzip `glasses-demo-android-src.zip`; put `libglasses.so`, `libcarina_vio.so`, `libcloud_protocol.so` (arm64-v8a) in `app/src/main/jniLibs/arm64-v8a/`.
2. Copy the three `.kt` files here into `app/src/main/java/com/viture/glasses/demo/`.
3. Changes to VITURE's files: `settings.gradle.kts` drop the foojay plugin and add the Maven Central mirror `https://maven-central.storage-download.googleapis.com/maven2/` (Maven Central rate-limits the cloud proxy); `app/build.gradle.kts` applicationId `com.brenai.viturebridge`, minSdk 29; manifest adds INTERNET, FOREGROUND_SERVICE(+_CONNECTED_DEVICE), POST_NOTIFICATIONS, RECORD_AUDIO, MODIFY_AUDIO_SETTINGS, the `KeepAlive` service and the `GameActivity` activity; `strings.xml` app_name "Brenai"; `MainActivity.kt`: `createPresentation()` returns at once (the glasses' screen is left to the game), `onCreate` starts `PoseServer` and `KeepAlive`, and after `startCarinaPollThread()` it opens `GameActivity`.
4. Android SDK 36, build-tools 36.0.0, NDK 27.3.13750724, CMake 3.22.1, Java 21; `./gradlew assembleDebug`.
5. Upload: `POST /api/apk` (owner) with the APK as the body; the neckband downloads it from `/api/apk`. It is signed with the build machine's debug key: a build from another machine will not install over it (uninstall first).

6. The launcher icon is Wizra's face (`wizra-icon.png` here, rendered from her model in the photo studio): `mipmap-*/ic_launcher(_round).png` at 48 to 192 px, and the adaptive icon uses `drawable-nodpi/wizra_icon.png` (432 px, her face on a dark purple edge) as its background with a transparent foreground; the demo's .webp icons are removed.
