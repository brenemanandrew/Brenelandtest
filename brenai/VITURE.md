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
Andrew does not want players to install anything. The only install-free route is the browser reading the glasses over USB itself (WebHID), which exists in Chrome and Edge on a PC and not on phones. `WizraStereo.probe()` (run it from the console with the glasses plugged into the PC) asks for the VITURE device, listens to every report it sends and keeps the last 400 in `WizraStereo.hidLog` as hex. The next step needs real glasses: move the head in one direction at a time, read the log, and find which bytes are the angles (and whether a command has to be sent first to switch the motion data on). When the format is known, turning it into `WizraStereo.head(yaw, pitch, roll)` is a few lines. On a phone there is no install-free route: a web page there cannot reach the glasses' sensor.
