# Brene for Virt-a-Mate

A VaM plugin plus a small helper app on the PC:
- **Library:** a cleaner, visual front for VaM's Hub, your scene collection and your looks and poses. It's a page on the PC or your phone, and VaM loads what you tap.
- **Panels:** big, themed panels you can drag around, in place of VaM's tiny menus.
- **Radial menu:** hold the ` key (under Esc), flick toward a choice, let go. Two flicks reach anything.
- **Character panel:** VaM's character editor in plain words, as a 9-step flow.
- **Flows:** "Set up a scene" and "Glasses setup", step by step with live checks.
- **Tutorials:** a spotlight tour that dims everything but the thing being explained, with steps that wait for you to try it. Welcome runs on the first start; the rest are in Help. The Library page has its own tour too.
- **Wizra:** the same Wizra as in Brenai (her save, memory and story), with her own voice, in a VaM person you pick as her body: lip sync, expressions from her actions, eyes on you.
- **VITURE glasses:** head tracking (3DOF, or 6DOF on the Luma Ultra), side-by-side 3D and hand control.

Not part of Breneland. Works in VaM's desktop mode and in a VR headset (Quest, Index and so on through SteamVR or Oculus).

## What is in it
| Path | What |
|---|---|
| `Custom/Scripts/Brene/Brene.cslist` | The plugin (load this one file in VaM). It compiles the `.cs` files beside it. |
| `BreneUIKit.cs` | Themes, rounded panels, the drag-around editor, and the shared placing helpers (`Ui.Top`, `Ui.Bottom`, `Ui.Span`, `Ui.Stretch`, `Ui.Scroll`). |
| `BreneMain.cs` | The plugin itself: panels, buttons, Wizra's chat, layout saving, settings in VaM's plugin screen. |
| `BreneViture.cs` | Head tracking on VaM's desktop camera, side-by-side 3D, hand grabbing. |
| `BreneRadial.cs` | The radial menu. |
| `BreneCharacter.cs` | The Character panel. |
| `BreneFlow.cs` | The step-by-step flow panel (numbered steps, live check, Back/Next). |
| `BreneCoach.cs` | The tutorial engine (spotlight, card, "try it" steps). |
| `BreneGuides.cs` | The Set up a scene and Glasses setup flows, the Help panel and the six tutorials. |
| `BreneWizra.cs` | Wizra's body: voice from her head, lip sync, expressions, looking at you. |
| `BreneVR.cs` | The headset version: the panels on a floating board, the wrist dock, quick lines for Wizra. |
| `BreneStory.cs` | Little Shepersville: story panel (day, time, place), places tied to scenes, turning-point choices, Margo's video call, the cabin laptop. |
| `relay/story.mjs` | The relay's story routes (`/story/*`), talking to Brenai's story routes (provisional shapes until the Brenai session's spec). |
| `story/margo/` | Margo's selfies and call faces as JPG (VaM cannot read WebP), from the Brenai session's branch. |
| `BreneReactions.cs` | Personality (from Brenai) and touch reactions for the cast: steps 9 and 10 of the Character flow. |
| `BreneLink.cs` | Talks to the relay on this PC: the state poll, the one shared JSON request (`Link.Json`), and the picture tiles and their loader (`Pics`, `Link.Thumbs`, `Link.Picture`). |
| `relay/brene-relay.mjs` | The relay (Node 22, no packages) on `http://127.0.0.1:8767`. Gathers the head pose from `brenai/tools/viture-bridge.py`, hands from its own page and Wizra's replies. |
| `relay/library.mjs`, `relay/library.html` | The Library: scenes, looks and poses from your VaM folder (packages included, thumbnails read straight out of the `.var` files), and the VaM Hub with big picture tiles, sorting, type filter and one-tap Install (with missing dependencies). |
| `relay/hands.html` | Hand tracking page (webcam, MediaPipe in the browser, served by the relay at `/hands`). |
| `relay/start-brene.bat` | Double-click to start the relay. |
| `test/` | `compile.sh` (C# compile check against stand-ins for Unity and VaM) and `relay.test.mjs` (relay end to end). |

## Install
1. **Copy the plugin.** Copy `Custom/Scripts/Brene` into your VaM folder, so you have `VaM\Custom\Scripts\Brene\Brene.cslist`.
2. **Load it in VaM.** Easiest: open the scene **Brene > Brene Loader** from VaM's scene browser (an empty scene with Brene in it; `Saves/scene/Brene/Brene Loader.json`, copy it in with the plugin). It works even when VaM's menu runs off the top of the screen. Otherwise: Main menu > Session Plugin Presets > Add plugin > `Brene.cslist` keeps it in every scene. Or add it to any atom's Plugins tab for one scene.
3. **Start the relay** (only needed for Wizra, glasses and hands). Copy the `relay` folder, double-click `start-brene.bat`, and leave the window open.
   - **Wizra from brenai.fly.dev**, with her memory and story: set `BRENAI_PIN` in Windows' environment variables. Also set `BRENAI_PASSWORD` if the game has a password. Never put these in a file.
   - **Without `BRENAI_PIN`:** she runs on LM Studio on this PC with her persona, but no memory. Her full persona needs the relay run from inside the repo (`vam/relay`); otherwise it uses a short stand-in.
4. **Glasses.** Run `start-viture.bat` (Brenai's VITURE helper, see `brenai/VITURE.md`). The relay finds it on port 8766.
5. **Hands.** Open `http://127.0.0.1:8767/hands` in Chrome or Edge on the PC and press Start camera. Leave the tab open.

## Wizra in VaM
- **Same Wizra:** with `BRENAI_PIN` set, the relay talks to brenai.fly.dev as you, so it's the Wizra from Brenai: same save, memory, mood and story. What you say in VaM is in your Brenai history too.
- **Her body:** in the Wizra panel tap **Pick her body** (cycles through the people in the scene), or use **Make her Wizra** at the end of the Character flow.
- **Her voice:** Brenai's own voice for her, made on the PC as in the app (Voice: on/off in the panel). It plays from her head, and her mouth moves with it. Only with Brenai; LM Studio mode has no voice.
- **Her face:** actions in her reply show for a few seconds (*smiles*, *laughs*, *blushes* = smile; *rolls her eyes*, *pouts*, *sighs* = frown; *gasps* = surprise). She looks at you while she talks.
- **The Build Wizra tutorial** (Help) walks through the Character flow using her description from Brenai (about 5'4", black hair, pale skin, hourglass figure, goth style) and ends by making that person her body and saying hi.

## Little Shepersville (story game, in progress)
- **The split:** Brenai's server is every character's mind and keeps the story (Brenai session). VaM is the town and the bodies (this plugin). Their route spec is still to come; the relay's Brenai calls are provisional and sit in three small functions in `relay/story.mjs`.
- **The cast:** Wizra, Zoe, Belinda, Margo. The chat panel's top bar says who you're talking to (tap to switch) and whose body it is (tap to cycle the scene's people). The Character flow's last step can make the person Wizra, Zoe, Belinda or Margo. Each has her own voice, lip sync and expressions; several can talk at once. Every message carries where you are and who is in the scene.
- **Until Brenai's story routes exist:** Wizra still answers through her normal chat; the others say plainly they aren't connected yet.
- **Story panel** (dock, or radial > Story): day, time and place from Brenai, and the nine places. Go loads that place's VaM scene; Set scene picks it from your scenes.
- **Turning points:** when Brenai has a question waiting, a card opens in the middle (on the board in VR) with its 2 to 4 answers.
- **Margo's call:** her call faces on a screen, changing with what she does in her replies (smiling, stern, delighted, listening); her voice plays like a phone call.
- **Cabin laptop:** title, text, word count; Save keeps it on the PC (plus a dated copy) and sends it to Brenai; Tell Margo saves, calls her and tells her.
- **Test:** `node vam/test/story.test.mjs`, 30 checks (including personality and touch): a stand-in Brenai with and without the story routes.

## In a VR headset
- **Automatic:** when VaM runs in a headset, everything Brene shows moves onto a board floating about an arm's length ahead at eye height: the same panels, layout, flows, radial menu and tutorials. Back on the monitor, it returns to the screen.
- **Pointing:** VaM's own laser pointers press the buttons.
- **Wrist dock:** raise your left hand and look at it. Board (show or hide), Menu (the ring), Wizra, Bring board here.
- **Wizra:** her voice comes from her body in the room. Quick lines under her chat (Hey, How's your day?, Tell me more...) for when there is no keyboard.
- **Switched off in VR:** the glasses' camera control and webcam hands (the headset tracks you itself).
- **Tutorial:** "In the headset" in Help.

## Flows
- **Set up a scene** (dock or radial): Start (keep or open a saved scene), People (select, send to Character, add a person), Pose, Lights (brightness and reach per light, add a light), View (glasses switches), Play & save.
- **Glasses setup**: Relay, Glasses, Straight ahead, Directions (flip any axis), 3D (layout, swap eyes, eye spacing), Hands. Steps that can be checked turn green by themselves ("Ready") or say what is missing.

## Tutorials
- **Welcome** runs once on the first start (about a minute): the dock, the radial menu (it waits for you to hold the key), Character, scenes, Library, layout, Help.
- **In Help (dock):** Make a character, Set up a scene, Glasses, Library, Layout. Each dims the screen except the part being explained; "try it" steps move on by themselves once you've done it.
- **Library page:** its own tour on the first visit; the ? button in the corner replays it.

## Radial menu
- **Hold and flick:** hold the menu key (default ` under Esc; change it in the plugin's settings: Tab, Q, F1 or the mouse's back button). A ring opens around the mouse. Move toward a choice and let go.
- **Tap instead:** tap the key (or the dock's **Menu** button) to leave the ring open, then click.
- **Back out:** right-click or Esc goes back one ring.
- **Top ring:** Character >, Scene >, Play/Edit, Glasses >, Wizra, Panels >, VaM menu, Undo.
  - Character > Start (the flow from step 1), Body, Face, Skin, Hair, Clothes, Pose, Save.
  - Scene > Play/Edit, Freeze, Undo, Redo, Save, Open.
  - Panels > Hide all / Show all, Edit layout, Theme, Bigger, Smaller.
- **Hidden panels:** the menu still opens when the panels are hidden, so it's the way back.

## Character panel
- **A flow, not menus:** 1 Who, 2 Start from (a saved whole look, or keep as is), 3 Body, 4 Face, 5 Skin, 6 Hair, 7 Clothes, 8 Pose, 9 Personality, 10 Reactions, 11 Finish (save the look or the scene).
- **Personality:** VaM has no personalities of its own. Hers lives in Brenai: her temperament bars (warmth, sarcasm, playfulness...) and her mood, read through the relay. It shifts as you spend time with her; her persona is edited in Brenai's robot panel (owner only).
- **Reactions:** for each part (head, face, hair, shoulder, arm, hand, belly, knee), the face she makes when touched (smile, frown, surprise or none) and whether she is told, so she can answer it in words. Touches come from your hands in VR, or the webcam hands; Test tries one. These are Brenai's own touch areas; Brenai keeps chest, hips and thighs off limits, so they are not offered. Today Brenai can be told about Wizra's head (pat) and face (poke); the rest need Brenai's story routes.
  - **Back** and **Next** walk the steps in order; the numbered steps along the top jump anywhere. Each step says what it is for in one line.
- **Nothing is taken away:** VaM's own menus are untouched ("VaM menu" opens them). Every shape stays reachable under "Show all body shapes" / "Show all face shapes" (60 at a time) or by search.
- **Who:** the selected person (or the first one). "Next person" cycles through.
- **Body and Face:** plain sliders such as Height, Thin, Heavy, Fit, Shoulders, Arms, Bust, Waist, Hips, Glutes, Thighs, Legs, Neck, Face width, Age, Eyes, Brow, Nose, Lips, Mouth, Cheekbones, Jaw, Chin and Ears.
  - Each is matched to a morph your VaM has, and the real morph name shows small underneath. A slider with no match is left out; the note says how many were found.
  - **Search** finds any shape by a word, with the package clutter stripped from the names.
  - **Reset** puts back everything you moved.
- **Skin, Hair, Clothes, Looks:** picture tiles of your saved presets, packages included. Tap one to put it on the person.
  - These come from the relay's library, so the relay must be running with your VaM folder set.

## The Library
- **Open it:** `http://127.0.0.1:8767/library` on the PC. The first time, paste your VaM folder (the one with VaM.exe), or start the relay with `--vam "C:\VaM"` or set `VAM_DIR`.
- **On your phone:** start the relay with `--lan` (`start-brene.bat --lan`). It prints a link with a key; open that link on the phone, on the same Wi-Fi.
- **Scenes, Looks, Poses:**
  - Tiles with their thumbnails. Search, All, Favourites, Recent, Mine (your own files), Packages.
  - Tap a tile, then **Load in VaM** (scenes) or **Apply** (looks and poses, to the person you pick).
  - The star saves a favourite.
- **Hub:** Hot Picks, Trending, Latest, Rating or Downloads, plus a type filter.
  - Tap a tile for the details, then **Install**. It downloads the package and any dependencies you don't have into `AddonPackages`, and asks VaM to rescan.
  - Free resources only; paid ones are not listed.
- **Status:** the dot at the top shows whether VaM (with the Brene plugin) is connected.

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
- **VaM menu smaller / bigger** (Layout panel, radial > Panels, or "Fit VaM menu" in the plugin's settings): widens the desktop camera's view so VaM's own menu fits a short screen. Not yet checked that VaM's menu shrinks with the view.
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
  - `library.test.mjs`, 38 checks:
    - a made-up VaM folder with loose files and `.var` packages (stored and compressed, in subfolders, one broken);
    - search, filters, favourites and recent;
    - thumbnails out of packages, and paths outside the VaM folder refused;
    - the plugin command round trip;
    - a stand-in Hub: list, detail, install with dependencies, a login page refused, downloads from other sites refused.
    - It also takes phone and PC pictures of the page (`--shots <dir>`).
  - The real Hub API answered through the relay (list and detail). No real download into a real VaM.
  - `relay.test.mjs`, 26 checks (including her voice through a stand-in Brenai `/api/tts`, with *actions* left out of what is voiced):
    - the real `viture-bridge.py --fake --6dof` pose reaching `/state`, with a moving position;
    - hands cleaned and timing out;
    - Wizra through a stand-in Brenai (password, PIN, streamed reply, cookies, wrong PIN);
    - Wizra through a stand-in LM Studio (her real persona, thinking stripped, LM Studio off).
    - things that used to stop or hang the relay: an odd address, a body over 1 MB, a second relay on the same port, two sign-ins at once.
- **Not tested: nothing has run inside VaM yet.** What could go wrong there:
  - **VaM may refuse a call:** VaM checks plugins when it loads them. If it refuses `UnityEngine.Networking` (web requests to the relay), the plugin will not load at all. The fix is a file-based link instead: tell the coding session.
  - **Some buttons may do nothing:** Undo, Redo, Save scene, Open scene, VaM menu and Freeze call VaM by method name. If a name differs in your VaM version, that button simply does nothing. Report which.
  - **Character panel unknowns:** it reaches shapes as float settings on the person's `geometry`. If Body and Face show "No shapes found", that route is wrong for your VaM. The friendly names are guesses at VaM's morph names; the note says how many matched. Skin, hair and clothing use `SkinPresets`, `HairPresets` and `ClothingPresets`.
  - **Wizra's body unknowns:** her voice is fetched as plain bytes and decoded by hand (`WavClip`), because VaM has no audio download module. Lip sync and expressions guess VaM's morph names ("Mouth Open", "Smile", "Frown", "Surprise"). Eyes use the person's `Eyes` setting `lookMode` = "Player". None of it has been seen in VaM.
  - **VR unknowns:** the board relies on VaM letting its laser pointers press a plugin's canvases (`AddCanvas`, asked for by name). Dragging panels with the pointer, the board's size and distance, and the wrist dock's position have not been seen in a headset.
  - **Adding atoms may not work:** "Add a person" and "Add a light" ask VaM by name (`AddAtomByType`). If nothing appears, use VaM's Add Atom and report it. Light sliders use the light's `Light` settings `intensity` and `range`.
  - **Tutorial spotlight not tried:** its placement has not been seen on a real screen.
  - **Menu key may clash:** if VaM already uses the menu key, pick another in the plugin's settings.
  - **Library loading may not work:** it calls VaM's `Load`, `RescanPackages` and the person's `AppearancePresets` / `PosePresets` with `presetBrowsePath` and `LoadPreset`. If a look or pose does not apply, the page shows VaM's answer.
  - **Head tracking may misbehave:** it assumes the desktop camera is `MonitorCenterCamera`. If the view jitters or fights the mouse, report it.
  - **Typing in Wizra's box may trigger VaM's own keyboard shortcuts.**
  - **Not tried for real:** side-by-side 3D on the glasses, hand grabbing on a real scene, and real Brenai and LM Studio.
- **The neckband:** VaM cannot run on it, and its browser cannot send its camera to the relay without https. Hands come from a PC webcam for now.
