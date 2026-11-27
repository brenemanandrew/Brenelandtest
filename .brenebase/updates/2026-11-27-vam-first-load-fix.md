---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-27
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - first real load in VaM 1.22: fixes until it loads
---
## Done
- Andrew's first load (VaM 1.22.0.13, Brene Loader scene) reached VaM's compiler. VaM's plugin checker refused `Dictionary<,>.ValueCollection.Enumerator` (BreneViture.cs 170). All dictionary loops now walk a List copy; the JSON trait loop uses a list from the relay (`traitList`).
- Second load: VaM's JSONStorableFloat/Bool/String have two callback overloads, so untyped lambdas (`v => ...`) and `null` were ambiguous (BreneMain.cs 48). All callbacks now name their parameter type; the test stand-ins now carry both overloads, so the compile check catches it.
- Third load: VaM leaves out Unity's audio download module (`UnityWebRequestMultimedia`, BreneWizra.cs 132). Voices are now fetched as bytes and decoded from WAV in the plugin (16, 24, 32-bit and float PCM), checked with mono against real WAV files.
- Fourth load: `centerCameraTarget` is a CameraTarget, not a Transform (BreneVR.cs 82). Review pass: the camera fields and controller points are now read as plain Unity objects (works for Camera, Transform, MonoBehaviour or GameObject), and Freeze no longer reads `freezeAnimation` directly.
- Fifth load (fresh VaM start too): Brene passes VaM's checks, then VaM's own compiler crashes the game while building Brene's types (mono_class_from_typeref in TypeBuilder.CreateType). Not reproducible with a newer mcs here; the compiled output only carries standard attributes. Bisecting with crash-test loaders (`vam/Custom/Scripts/BreneTest`, scenes `Saves/scene/BreneTest/Test A-F`).
- Still unproven in VaM: Texture2D.LoadImage (pictures), UnityEngine.XR (headset), and the VaM member names listed in the README.
- `test/compile.sh` now fails on these loop patterns so they don't come back.
## Tested
- Compile check passed; story test 28 passed.
## Not tested
- Whether VaM's checker accepts everything else (it reports one problem at a time).
- Bisect round 1 (Andrew): tests with BreneUIKit.cs crashed VaM's compiler, the one without it loaded. BreneUIKit changed: the Role enum (a MonoBehaviour field) is now int constants, the helper classes `UI` and `Editor` are renamed `Ui` and `BreneEdit`, anonymous `delegate { }` replaced by lambdas. Round 2 tests P (fixed file alone), Q (drag handlers), R (colour table) sent with the fixed Brene.
- VaM's security setting "Allow Plugins Network Access" must be on for Brene's relay link.

- CONFIRMED: Brene loads and runs in Andrew's VaM 1.22 (panels, dock, Welcome tour on screen). The crash was in BreneUIKit.cs; the exact construct among the three changed was not isolated.
- Layout fixes from his first screenshot: button panels grow to fit their buttons (and refit when buttons are dragged between panels), Layout panel moved off the bottom, Wizra chat text no longer covers its who / body / voice bar.

## Broken
- None known.
## Open
- Next VaM load result.
## Settings changed
- None.
