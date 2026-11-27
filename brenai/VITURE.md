# Brenai on VITURE glasses

Written for the VITURE Pro (second generation, 3DoF: it knows which way the head is turned, not where it is). Works the same for any side-by-side 3D display.

## Step 2: true 3D (built, in the game)
- Settings wheel, 🥽 "3D glasses". The scene is drawn once per eye, left and right halves of the screen. On a phone it goes full screen and locks sideways (Chrome on Android; an iPhone has to be held sideways by hand). An upright phone sends the glasses a narrow picture, which their side-by-side mode then splits in the wrong place (one image at the far left, one at the far right).
- Two layouts, switched with the button in the top corner of the view:
  - **Half**: each half is squeezed. Use it when the glasses take a normal 16:9 picture and stretch each half across the eye (1920x1080 side-by-side).
  - **Full**: each half keeps its true shape. Use it when the glasses show a 32:9 picture (3840x1080).
  - On a phone, use Half: the phone sends a normal 1920x1080 picture. Full is for a PC whose screen becomes 3840x1080 when the glasses switch to side-by-side.
- If the picture looks doubled or squashed, it is the other layout. If depth looks inside out, the eyes are swapped: tell the coding session, it is a one line change (`cameraL` and `cameraR` in `renderView`, `avatar-vrm.js`).
- In this mode the usual interface is put away. Her last line shows as a subtitle, there is a box to type in, and voice works as usual. Esc or "✕ 3D" leaves.
- The two eyes meet at her distance, so she sits at the depth of the screen and the room goes back behind her. Eye spacing is 64 mm (`avatar.stereo(undefined, { eye: 0.064 })`).
- Code: `renderView()` and `stereo()` in `public/avatar-vrm.js`, the screen around it in `public/stereo.js`.

## Step 3: turn your head to look around her room (prepared, needs a helper app)
The game side is done: `WizraStereo.head(yaw, pitch, roll)` in degrees turns the view on top of whatever camera is in charge, relative to where you were looking when it started. The ⌖ button re-centres.

What is missing is something that reads the glasses and tells the page. A web page cannot read the glasses itself. While 3D mode is on, the page tries `ws://127.0.0.1:8766` every 6 seconds and accepts text messages like:

```
{"yaw": 12.5, "pitch": -3.0, "roll": 0.4}
```

Degrees. yaw: positive = head turned left. pitch: positive = looking up. roll: positive = head tilted to the right shoulder. Send 30 to 60 a second. If the direction is wrong on a real device, flip the sign in the helper, not in the game.

### The helper (PC version built, waiting for VITURE's SDK)
The PC version is in `F:\Projects\Brenai\viture` on Andrew's PC (`viture_head.py`, port 8766, because 8765 is taken there by other tools). It needs VITURE's Windows SDK files, which are behind a request form. What it does:
1. Get the VITURE XR Glasses SDK (C library; Windows, macOS, Linux, Android): https://www.viture.com/developer/glasses-sdk/glasses
2. Open the glasses, turn the IMU on, and register the callback that receives head orientation (the SDK pushes roll, pitch, yaw as floats).
3. Run a WebSocket server on 127.0.0.1:8766 and send each reading in the format above to every connected client. No other features are needed.
4. On the PC: a small console program (C or C++ with any WebSocket library, or a Python script calling the SDK's library through ctypes plus the `websockets` package). Start it, plug the glasses in, open the game in Chrome or Edge, switch 3D mode on.
5. On the phone: the same thing as an Android app or service using the Android build of the SDK. A page on https may connect to `ws://127.0.0.1` in Chrome on Android; SpaceWalker's own browser has not been checked for this, and SpaceWalker may hold the glasses' sensor while it is open. If either blocks it, use Chrome with the glasses plugged in as a plain display.

### Not checked on real glasses (nobody building this had a pair)
- Whether SpaceWalker's browser puts the glasses into side-by-side mode for a page, or whether the glasses have to be switched by hand (long press on the glasses' button on most VITURE models).
- Which of Half and Full matches, and whether the eyes are the right way round.
- Whether the helper can read the sensor while SpaceWalker is running.
- Comfort: text size, eye spacing, and how close she can get before it is hard to look at.

## Head tracking with nothing installed (experimental, not working yet)
Andrew does not want players to install anything. The install-free route is the browser reading the glasses over USB itself (WebHID), which exists in Chrome and Edge on a PC and not on phones. It is built (2026-11-23): in 3D mode the 🧭 button calls `WizraStereo.track(true)`, which asks once for the VITURE device (the browser remembers it, so later it connects by itself when 3D mode starts), sends the command that switches the motion sensor on, and turns each motion packet into `WizraStereo.head(yaw, pitch, roll)`. Once data arrives three arrow buttons appear that flip left/right, up/down and tilt if one goes the wrong way; ⌖ sets straight ahead. The packet format comes from the open source project mgschwan/viture_virtual_display (written for the VITURE Pro) and is described in the comment in `public/stereo.js`. The Pro 2 (USB product 0x1301, one USB part) did not answer that format on Andrew's PC; it speaks a newer one, taken from the open source project elasticjava/viture-v2 and added on 2026-11-24 (also described in `public/stereo.js`). Both are sent. Each 🧭 press also saves the USB details (device layout, what was sent, the first raw packets) to `/api/diag` on the server, owner only, so the format can be checked without the console. Tested against simulated glasses for both formats; on Andrew's real Pro 2 the data arrives (confirmed), and the axes were set from a recording of him turning left and looking up (x right, y up, z toward the wearer). Tilt direction was not in the recording and follows from the other two. If it finds the glasses but no movement arrives, `WizraStereo.hidState` says how many parts were found and reached, and `WizraStereo.probe()` records raw packets in `WizraStereo.hidLog` for working out what differs. The helper app above is then not needed on a PC. On a phone there is no install-free route: phone browsers cannot reach the glasses' sensor, and VITURE's Android SDK only works inside an installed app. Andrew put VITURE's SDK zips (Android and Windows) in his Google Drive; they were not opened for this (too large for the Drive tool here).

## Luma Ultra: the helper (2026-11-26)
The Luma Ultra (VITURE's SDK calls it "Carina", USB product 0x1102) does its head tracking in VITURE's PC library from its cameras, over a raw USB link a browser cannot use. The only part a browser sees is "VITURE Microphone" (volume buttons), which never sends movement. So it needs `tools/viture-bridge.py` running on the PC (also served at `https://brenai.fly.dev/viture-bridge.py`):
1. Install Python 3 if the PC has none (Microsoft Store, or `winget install Python.Python.3.12`).
2. Put `viture-bridge.py` in the SDK folder that holds `glasses.dll` (with `carina_vio.dll`, `libusb-1.0.dll`, `opencv_world4100.dll`), the Windows lib folder of the SDK on Andrew's Drive.
3. Close VITURE's own apps, plug in the glasses, run `python viture-bridge.py` there (add `--6dof` to track leaning and moving too). It prints the glasses' name, then yaw, pitch and roll.
4. In the game, turn 3D glasses mode on. The page connects to `ws://127.0.0.1:8766` by itself (no device picker needed). Edge or Chrome may ask to allow access to devices on the local network: allow it.
Confirmed working by Andrew on his Luma Ultra and Surface on 2026-11-26 (3DOF), with the SDK in `C:\Viture\VITURE_XR_Glasses_SDK_for_Windows_x86_64` and the helper in `C:\Viture`, run as `python viture-bridge.py --sdk <folder with glasses.dll>`; `start-viture.bat` (served at `/start-viture.bat`) does that with a double-click. `python viture-bridge.py --fake` sends a made-up head turn without glasses, to test the link. Written from the SDK headers and VITURE's glasses-demo (`get_gl_pose_carina`, OpenGL axes, the same as the Pro 2's), not yet run on the real glasses. If initialize or start fails, the SDK may need WinUSB on the glasses' tracking interface (VITURE's own demo would fail the same way).

## 6DOF (2026-11-26)
With `--6dof` (now the default in `start-viture.bat`) the helper also sends `pos: [x, y, z]` in metres (x right, y up, z back). `stereo.js` `move()` zeroes it on the first reading after ⌖ (or 3D mode on), holds each axis within 1.5 m, and calls `avatar.headPos()`; `renderView` adds it to the camera for the two eye pictures only, turned with the view's heading, then puts the camera back. So leaning, crouching and stepping move the view; whatever camera the game is using stays in charge. `viture-bridge.py --fake --6dof` sways the view side to side for a test.

## The neckband (2026-11-26)
`check.html` on the neckband (Chrome 158, Android 10, reported as "K"): WebXR immersive-vr and immersive-ar supported, WebHID and WebUSB present but no devices, one camera ("camera 0, facing back", 640x480, opens), no deviceorientation readings, no local helper. So: head tracking there goes through WebXR, not a helper. The 🕶 Headset view button (shown only where immersive-vr is supported) starts `avatar.xr('vr')`: three's WebXR renderer draws both eyes with the browser's head pose; each frame the XR rig is put where the game's camera is (level, same heading) and the head pose is added on top (`renderView`); the XR session drives the game's frame loop while it runs (`xrHook` in avatar.js). Not yet tried on the neckband. In an immersive view the page's buttons are not shown: leave with the neckband's back gesture or button. Hand control uses the outward camera (not mirrored); WebXR's own hand tracking (`hand-tracking` is asked for as optional) is not wired in yet.

Confirmed on the neckband 2026-11-26: headset view moves with the head. The first try showed only a thin line: three used WebXR projection layers, which the neckband's Chrome offers but does not show; `xrStart` now hides `createProjectionLayer` (unless `localStorage brenai.xrLayers = 1`) so three uses one XRWebGLLayer. Picture: 1344x756, 671x755 per eye, about 120 frames a second. The first-seconds report (`/api/clientlog`, `xr` entries) stays in.
