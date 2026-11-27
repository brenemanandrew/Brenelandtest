# Arden DC Trainer (PIT, Pick, Pack, Ship)

A 3D training app for the Arden DC floor. One file (`index.html`, Three.js r181 from the CDN, WebXR). Runs in the Quest 3 browser in VR, and on any PC browser with mouse and keyboard. Not part of Breneland.

## Modules
| # | Module | Source | Steps |
|---|---|---|---|
| 1 | Forklift (PIT) | Generic OSHA 1910.178 basics. **No Arden PIT SW was found on the Drive.** Replace when written. | Who may drive, 8-point pre-shift inspection (random defect 85% of runs), tag-out, mounting, seatbelt, drive to a pallet, pick it up, horn at the intersection, put away on P104 level B (1.6 m beam), park, shut down |
| 2 | Pick: Pallet Land | Pallet Land Pick SW, Induction SW, Short Pick deviation (Draft 1.0, 10/17/2026) | PPE, THOR check (dead THOR scenario), 415 login, zone F7, totes and cones, tote colors, scan location and product, count, build the pallet, F4, a short pick (discrepancy card, blue cone, pick hospital, outbox times), complete and stage, F1 F1 Save |
| 3 | Pack: parcel | Kaizen 03 parcel core process rev 0.6 | All 10 steps, plus scale in kg, missing tote, blind pack, smallest box, invalid-carrier popup, label and sticker rules, conveyor / tote / pallet rule |
| 4 | Ship | Kaizen 03 truck core process rev 0.6, Pallet Land staging step, generic dock safety | Totes in transit, two-person lift, PALLET_SSCC, heavy-first build (ordered), 50 in, mixed carton, wrap and banding rules, system weight + 40/70 lb, BOL pinned on top, label layout and C, stage near the Lead Hub, dock lock before entering a trailer |
| 5 | Gemba waste hunt | Kaizen 03 findings + TIMWOODS | 9 wastes placed on the floor (stickers, far box stock, pallet pile, waiting picker, banding, crushed carton, pre-built cartons, pallet in the walkway, lead re-typing weights) |

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

## Tested (2026-11-27, headless Chrome)
- `test/flow.mjs`: runs all five modules through the real step engine (no JS errors). The forklift run uses the real driving physics: the pallet stops at the carriage, lifts at pocket height, goes into P104-B and is set on the 1.6 m beam, the truck parks.
- `test/xr.mjs`: Meta's WebXR emulator (IWER, Quest 3 profile; download `iwer.min.js` from `cdn.jsdelivr.net/npm/iwer@2/build/` next to the script). Enter VR works, the panel appears, a right-controller trigger on the panel starts a module.
- **Not tested on a real Quest 3.** Comfort, text size, performance and stick feel need a headset run.
- Run: `python3 -m http.server 8099` in this folder, then `node test/flow.mjs <outdir>` (needs Playwright).

## Placeholders to confirm
- Box sizes #2-#6 and the product dimensions in Pack step 4.
- Forklift capacity plate (5000 lb @ 24 in), truck type (sit-down counterbalance). Arden's reach trucks are not modeled.
- Dock lock / loading content is generic.
- English only. The pack station app is EN/ES; Spanish text is the next obvious add.
