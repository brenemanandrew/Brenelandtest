# Brene for Virt-a-Mate

A VaM plugin plus a small helper app on the PC:
- **Panels:** big, themed panels you can drag around, in place of VaM's tiny menus.
- **Wizra:** her chat inside VaM.
- **VITURE glasses:** head tracking (3DOF, or 6DOF on the Luma Ultra), side-by-side 3D and hand control.

Not part of Breneland. This is VaM's desktop mode. VaM's own VR mode still needs a SteamVR or Oculus headset.

## What is in it
| Path | What |
|---|---|
| `Custom/Scripts/Brene/Brene.cslist` | The plugin (load this one file in VaM). It compiles the four `.cs` files beside it. |
| `BreneUIKit.cs` | Themes, rounded panels, the drag-around editor. |
| `BreneMain.cs` | The plugin itself: panels, buttons, Wizra's chat, layout saving, settings in VaM's plugin screen. |
| `BreneViture.cs` | Head tracking on VaM's desktop camera, side-by-side 3D, hand grabbing. |
| `BreneLink.cs` | Talks to the relay on this PC. |
| `relay/brene-relay.mjs` | The relay (Node 22, no packages) on `http://127.0.0.1:8767`. Gathers the head pose from `brenai/tools/viture-bridge.py`, hands from its own page and Wizra's replies. |
| `relay/hands.html` | Hand tracking page (webcam, MediaPipe in the browser, served by the relay at `/hands`). |
| `relay/start-brene.bat` | Double-click to start the relay. |
| `test/` | `compile.sh` (C# compile check against stand-ins for Unity and VaM) and `relay.test.mjs` (relay end to end). |

## Install
1. **Copy the plugin.** Copy `Custom/Scripts/Brene` into your VaM folder, so you have `VaM\Custom\Scripts\Brene\Brene.cslist`.
2. **Load it in VaM.** Main menu > Session Plugin Presets > Add plugin > `Brene.cslist` keeps it in every scene. Or add it to any atom's Plugins tab for one scene.
3. **Start the relay** (only needed for Wizra, glasses and hands). Copy the `relay` folder, double-click `start-brene.bat`, and leave the window open.
   - **Wizra from brenai.fly.dev**, with her memory and story: set `BRENAI_PIN` in Windows' environment variables. Also set `BRENAI_PASSWORD` if the game has a password. Never put these in a file.
   - **Without `BRENAI_PIN`:** she runs on LM Studio on this PC with her persona, but no memory. Her full persona needs the relay run from inside the repo (`vam/relay`); otherwise it uses a short stand-in.
4. **Glasses.** Run `start-viture.bat` (Brenai's VITURE helper, see `brenai/VITURE.md`). The relay finds it on port 8766.
5. **Hands.** Open `http://127.0.0.1:8767/hands` in Chrome or Edge on the PC and press Start camera. Leave the tab open.

## Using it
- **Panels:**
  - Scene: Play/Edit, Freeze, Undo, Redo, Save scene, Open scene, VaM menu.
  - People: tap a name to select that person.
  - Glasses: Head track, 3D, 3D Full, Re-centre, Hands.
  - Layout: Theme, Bigger, Smaller, Save layout, Show all.
  - Wizra: chat.
  - Brene dock: Edit layout and a status line.
- **Edit layout** (the dock):
  - Drag a title bar to move a panel.
  - Drag the coloured corner to resize it.
  - Drag a button onto another panel or another place.
  - Press x to hide a panel ("Show all" brings panels back).
  - Leaving edit mode saves to `Saves/PluginData/Brene/layout.json`.
- **Theme** cycles Night, Ocean, Rose, Forest and Light. **Bigger** and **Smaller** scale everything.
- **3D:**
  - Use **Half** when the glasses take a 1920x1080 side-by-side picture.
  - Use **Full** when Windows turns the screen into 3840x1080.
  - Wrong-way depth: tick "Swap eyes" in the plugin's settings.
- **Head:** turning your head turns the view, on top of the mouse camera. With 6DOF, leaning moves it too.
  - Re-centre sets straight ahead.
  - Flip boxes in the plugin settings fix an axis that goes the wrong way.
- **Hands:** a coloured ball follows each hand.
  - Close your hand (or pinch) over a control point to hold it; open to let go.
  - Move the hand toward the camera or away to carry the point nearer or further.

## What was tested, and what was not
- **Tested here (Linux, no VaM):**
  - The plugin compiles as C# 5 against stand-ins that copy the Unity and VaM signatures it uses.
  - `relay.test.mjs`, 17 checks:
    - the real `viture-bridge.py --fake --6dof` pose reaching `/state`, with a moving position;
    - hands cleaned and timing out;
    - Wizra through a stand-in Brenai (password, PIN, streamed reply, cookies, wrong PIN);
    - Wizra through a stand-in LM Studio (her real persona, thinking stripped, LM Studio off).
- **Not tested: nothing has run inside VaM yet.** What could go wrong there:
  - **VaM may refuse a call:** VaM checks plugins when it loads them. If it refuses `UnityEngine.Networking` (web requests to the relay), the plugin will not load at all. The fix is a file-based link instead: tell the coding session.
  - **Some buttons may do nothing:** Undo, Redo, Save scene, Open scene, VaM menu and Freeze call VaM by method name. If a name differs in your VaM version, that button simply does nothing. Report which.
  - **Head tracking may misbehave:** it assumes the desktop camera is `MonitorCenterCamera`. If the view jitters or fights the mouse, report it.
  - **Typing in Wizra's box may trigger VaM's own keyboard shortcuts.**
  - **Not tried for real:** side-by-side 3D on the glasses, hand grabbing on a real scene, and real Brenai and LM Studio.
- **The neckband:** VaM cannot run on it, and its browser cannot send its camera to the relay without https. Hands come from a PC webcam for now.
