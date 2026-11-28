# Arden DC Trainer (PIT, Pick, Pack, Ship)

A 3D training app for the Arden DC floor. One file (`index.html`, Three.js r181 from the CDN, WebXR). Runs in the Quest 3 browser in VR, and on any PC browser with mouse and keyboard. Not part of Breneland.

## The devices (the core of the job)
Every EWM step is done on a working device screen, not a quiz button:
- **THOR** (Pallet Land): the vehicle-mount terminal on the rider truck. You step on, it moves with you, and you type on its keys (415, ENT, F7, P100, F4, F1 F1 Save). Its paired handheld scanner reads every barcode into the field the screen is waiting on.
- **Handheld** (Flow Rack): one mobile computer that scans, shows the RF screens and has the keys. Taken from the charging cradle; in VR it sits in your right hand and you press its keys with the left controller.
- **Station screens** (Induction, Pack PK04, Truck pack PK10): EWM screens with fields, buttons (Tote Induct, Move HU, Unpack HU, Create HU, Move to HU, Ship, Full Ship Screen, PALLET_SSCC, Capacity) and a keypad, plus the station's corded scanner.
- Wrong scan, wrong key or wrong value: the device shows the error (for example "Red tote first: it is a hot order") and it counts as a mistake.
- PC: click the device keys (a copy of the screen sits in the instruction panel), or type digits, P, K, Enter, Backspace and F1-F8 on the keyboard.

The screens are modeled on the SW text (transactions, keys, field names). They are not copies of the real EWM layouts; screenshots of the real screens would let them match.

## Modules
| # | Module | Source | Devices |
|---|---|---|---|
| 1 | Forklift (PIT) | Generic OSHA 1910.178 basics. **No Arden PIT SW was found.** | Sit-down counterbalance truck: inspection, drive, put away at 1.6 m, park |
| 2 | Induction | Induction SW, Draft 1.0 | Induction computer (ZEWM_INDUCT, 0103, oldest order, wave colors) + scanner |
| 3 | Pick: Pallet Land | Pallet Land Pick SW + Short Pick deviation, Draft 1.0 | THOR terminal + paired scanner: dead THOR, 415, F7 zone, tote, SRCBIN, product, count, F4, short pick, F1 F1 Save |
| 4 | Pick: Flow Rack | Flow Rack Pick SW, Draft 1.0 | Handheld: 415, D300, 4 totes with the red hot tote first, location, product, poly bag, Order Pick Complete = No, conveyor |
| 5 | Pack: parcel | Kaizen 03 parcel core process rev 0.6 | PK04 screen + scanner: work center, Move HU, missing tote, Unpack HU, Create HU, Move to HU, Ship, Full Ship Screen, invalid-carrier popup |
| 6 | Ship | Kaizen 03 truck core process rev 0.6 + staging + generic dock safety | PK10 screen + scanner: PALLET_SSCC, Capacity, 612 + 40 = 652 typed on Full Ship Screen, lane scan |
| 7 | Gemba waste hunt | Kaizen 03 findings + TIMWOODS | 9 wastes on the floor |

Every step shows the WHY from the SW. Wrong answers count as mistakes; unsafe ones (missed defect, no horn, forks up while traveling, struck rack, PIT in the walkway, unsafe lift) count as safety calls. Score = 100 - 5 per mistake - 10 per safety call. Pass at 80 with no missed defect or strike.

After each module the trainee fills a **Kaizen card** (one TIMWOODS waste + a note on PC). **Records** (top bar) shows runs and ideas and exports both as CSV for the training records and the CI idea board. Records live in the browser on that device (localStorage) until exported.

## Controls
- PC: click the view, WASD walk, mouse look, click or E to use, 1-9 for panel buttons, Esc frees the mouse. Forklift: W/S, A/D, R/F forks, T/G tilt, H horn.
- Quest 3: Enter VR. Trigger uses things and presses panel buttons. Left stick walks, right stick snap-turns, X brings the panel in front of you. Forklift: left stick drive/steer, right stick lift/tilt, A horn. Seat height is set from your head when you get on.

## Running it on the Quest 3
WebXR needs HTTPS. Any static host works (no server code):
- GitHub Pages on this repo, or
- a Fly app with the same nginx Dockerfile the Breneland test site uses.
Nothing has been deployed. Open the URL in the Quest browser and press Enter VR.

## Tested (2026-11-27, headless Chrome; devices added the same day)
- `test/flow.mjs`: runs all seven modules through the real step engine, typing on the device keys and scanning barcodes from the hand (no JS errors). Also checks that wrong inputs (514 instead of 415, a blue tote before the red one) show the device error and count as mistakes. The forklift run uses the real driving physics: the pallet stops at the carriage, lifts at pocket height, goes into P104-B and is set on the 1.6 m beam, the truck parks.
- `test/xr.mjs` also stands the emulated headset 0.7 m off-centre and checks the head lands on the forklift seat and the THOR platform (error 0.000 m).
- `test/xr.mjs`: Meta's WebXR emulator (IWER, Quest 3 profile; download `iwer.min.js` from `cdn.jsdelivr.net/npm/iwer@2/build/` next to the script). Enter VR works, the panel appears, a right-controller trigger on the panel starts a module, and the left controller's ray types 415 + ENT on the handheld held in the right hand.
- **Not tested on a real Quest 3.** Comfort, text size, performance and stick feel need a headset run.
- Run: `python3 -m http.server 8099` in this folder, then `node test/flow.mjs <outdir>` (needs Playwright).

## Cleanup pass (2026-11-27)
Bugs fixed:
- Typing in the Trainee box also drove the game (E used things, digits pressed panel buttons, WASD walked). Game keys are now ignored while a dialog is open.
- Record and idea timestamps were UTC. They are local time now.
- VR: getting on the forklift or a THOR put you wherever the centre of your play space was, not on the seat or platform. You now land on it facing forward from wherever you stand, and snap turn pivots around your head.
- VR: there was no way back to the menu inside a module. The panel header has a MENU button (press twice).
- The waste hunt timer kept running on its results screen; leaving it with nothing found wrote an empty record.
- A toast from the last module could carry into the next one. A held item could carry over through the menu.
- A name with a quote mark broke the Trainee box. CSV cells starting with = + - @ are now exported as text.
- Keys stuck down if the window lost focus mid-walk.

Easier to use:
- The confirm key (F8 / F4) accepts what you typed without pressing ENT first, like the real screen. A spare ENT is no longer a mistake; the device says which key is next.
- PC keyboard: D now types on the device (for D300), Tab frees or grabs the mouse.
- Menu asks before dropping a run. Kaizen note is a proper box, not a browser prompt. Enter saves the name.
- Reticle is green when the thing is in reach, grey when it is too far. VR panel buttons light up under the pointer. Controllers buzz on right, wrong and safety calls.
- Progress bar on the panel. Help box toggles with the ? button and stays off once closed. "Click the view to look around" hint. A message if the 3D library cannot load.
- One Enter VR button in the top bar, shown only when a headset is there (the grey "VR NOT SUPPORTED" box is gone).

Faster: static geometry is merged per material. The menu view went from 570 draw calls to 170 (measured in headless Chrome), and the VR panel redraws once a second instead of four times.

`test/checks.mjs` covers the new behaviour (F8 accepts typed values, spare ENT, dialog swallows game keys) and prints the draw calls.

## Feedback pass from the Brene for VaM session (2026-11-28)
Andrew's feedback to that session on its own tool, taken from its update notes (`.brenebase/updates/2026-11-27-vam-*.md`, `2026-11-28-vam-phone-tour-icons-vr.md` on `claude/multi-agent-work-router-w9jzlg`), applied here. Standing rule kept: nothing removed, only how it is presented.
- **Too busy -> calm screen.** The controls box is off unless asked for (? button). The instruction panel shrinks to a round chip (corner button) that shows the step number, can be dragged anywhere, is remembered, and comes back on screen if it was saved off it. A new step while shrunk shows a short note and pulses the chip.
- **Tour at every start** with a "Don't show this at start" tick. Six cards, PC and VR wording, highlights the thing it is talking about on PC. "Show the tour" is on the menu.
- **Icons drawn in code** on the menu, results, tour and top bar buttons, on the VR board and on the wrist dock.
- **VR, controllers first:**
  - The board comes to arm's length (0.62 m), 29 degrees left of where you look so it does not cover the work, facing you, 0.6 m wide with 4.3 cm buttons. It only moves by itself when it is out of reach or out of view. On a THOR it rides along.
  - Wrist dock on the left controller, shown when you look at it: step and progress, Board here, Hide board, Menu (press twice inside a module). Buttons are 5.4 x 7.8 cm.
  - Fingertip poke: press any button on the board, the wrist or a device by pushing the glowing tip of a controller through it from the front. No trigger. The handheld is 1.5x in VR so its keys can be poked.
  - Hover highlight and haptics were already in.
- Hand tracking is left out, as on that tool (controllers first).

Checked in the emulated Quest 3: board at 0.62 m and 29 degrees, a poke on the first menu button started the module, the wrist dock shows when the left hand is raised. **Not checked in a headset:** the wrist dock's angle on the real controller, poke feel, and whether 29 degrees left is the right place for the board.

## Hands, touch and a live preview (2026-11-28)
- **VR hands.** Your hands show as see-through yellow outlines where your real hands are, and interaction comes from them.
  - Same hand design as Brenai (its `brenai/public/xrhands.js`, inlined): a smooth see-through hand with a glowing pale-cyan edge, gold while squeezing or pinching. No bones, no joint dots, no laser line. One change here: the edge is alpha-blended instead of additive so it shows over this app's white board.
  - Controllers: an open hand on the grip; the index finger curls with the trigger, the rest with the grip. Poke uses the drawn index fingertip. Far things: point and pull the trigger, the ring shows what you are on.
  - Hand tracking (no controllers): your real joints drive the same hand shape, poke uses your real index fingertip, pinch is the trigger. There is no walking without sticks, so controllers stay the main way.
  - The pointer starts 12 cm behind the hand, so something the hand is in or on is picked first. The grip button grabs as well as the trigger.
- **Touch (phone, tablet).** Drag to look, tap a thing to use it (taps work on device keys in the 3D view), a round pad walks and drives, yellow buttons for forks, tilt and horn. On a narrow screen the panel moves to the top and the top bar shows icons only.
- Own dialogs instead of browser confirm boxes, and storage that cannot throw, so the page works inside a hosted preview frame.
- `test/phone.mjs` (touch), `test/demo.mjs` (records the demo video), `test/xr.mjs` (now also checks the hands in controller and hand-tracking mode).
- Checked in the emulator only: a hand on each controller, the index curls with the trigger, poke with the drawn fingertip starts a module, tracked-hand mode draws both hands. **Not checked in a headset.**

## Floor layout from the Arden floor plan (2026-11-28)
The floor now follows the plan in `Facility_Outlook_Arden.pptx` (Drive, Jan 2026; the DWG `Arden_Facility_Layout_7.9.25.dwg` is the source drawing but could not be opened here) plus Andrew's notes: cantilever on the west wall, staging in the middle strip with induction at its north end and the Lead Hub and Non Conf at its south end, truck pack next to parcel pack. Top view: `floorplan-top-view.png` (north up).

Corrected by Andrew the same day against the blueprint: long product is on the west wall and in row PB (first rack row); the old long product strip is staging with the Lead Hub as a small box at its south end; Unit / Carton Pick is flow racks north and south with static rack in the middle; the pushback racks on the north wall are gone (open floor); induction is against the north wall at the north-east corner of the staging strip.

West to east: cantilever (long product) on the west wall and row PB; Pallet Land with north-south aisles (the working aisle is P101-P106 on its west side, P111-P116 on its east side, a cross aisle with the striped stop, then a south block); the middle strip (induction and the THORs at the north end, staging lanes L01 to L05, Lead Hub and Non Conf at the south end); Unit / Carton Pick (flow racks D100-D300 on the north wall, shelf rows, the conveyor running down the east side to pack); the walkway; VA and Slow Moving; maintenance. South of Unit Pick: Truck Pack (PK10) then Parcel Pack (PK03, PK04). A main aisle runs east-west across the building; south of it are the inbound dock, the outbound dock (Door 4), and the offices. East: East Warehouse Storage and the chargers.

It is about 1:3 scale (60 x 34 m), so there are 3 rack aisles where the building has about 14, and aisle widths are kept at real size so the forklift fits. The forklift module is now a real route: chargers, west along the main aisle to the inbound dock, back and north into Pallet Land, put away, return.

Not from the plan (assumed): where the THORs park, the exact spot of the induction computer, lane numbering (L05 nearest the Lead Hub), which dock door is Door 4, and everything inside VA, Slow Moving and East Warehouse Storage (scenery only).

`test/map.mjs` renders the top view. All module tests, the VR emulator checks and the phone checks pass on the new floor.

## Placeholders to confirm
- Box sizes #2-#6 and the product dimensions in Pack step 4.
- Forklift capacity plate (5000 lb @ 24 in), truck type (sit-down counterbalance). Arden's reach trucks are not modeled.
- Dock lock / loading content is generic.
- English only. The pack station app is EN/ES; Spanish text is the next obvious add.
