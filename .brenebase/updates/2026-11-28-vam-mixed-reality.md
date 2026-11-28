---
project: brenai
by: Claude (Brenebase session)
date: 2026-11-28
branch: claude/multi-agent-work-router-w9jzlg
title: Brene for VaM - mixed reality switch (see your room)
---
## Done
- BreneMR.cs: "Mixed reality" switch keys every camera to a solid colour (Green default; Blue, Magenta, Black) and switches scenery atoms off (CustomUnityAsset and room/floor/wall/sky-named atoms), re-applied every frame; off restores cameras and atoms.
- On the wrist dock ("See my room", for safety), Glasses panel, radial > Glasses, plugin settings; "In the headset" tour step.
- README section: works with Virtual Desktop passthrough + chroma key; not with Steam Link or Meta Link.
## Tested
- compile.sh ok.
## Not tested
- In VaM and the headset; Virtual Desktop's passthrough keying; VaM's atom SetOn by name.
## Broken
- None known.
## Open
- Andrew needs Virtual Desktop (he uses Steam Link now) for passthrough.
- Floor height alignment with the real floor not built.
## Settings changed
- Plugin settings "Mixed reality (passthrough)", "Mixed reality key colour".
