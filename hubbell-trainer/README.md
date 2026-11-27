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

## Placeholders to confirm
- Box sizes #2-#6 and the product dimensions in Pack step 4.
- Forklift capacity plate (5000 lb @ 24 in), truck type (sit-down counterbalance). Arden's reach trucks are not modeled.
- Dock lock / loading content is generic.
- English only. The pack station app is EN/ES; Spanish text is the next obvious add.
