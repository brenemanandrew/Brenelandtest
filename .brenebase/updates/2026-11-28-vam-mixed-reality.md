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
- Andrew's hand design (via the Brenai session): VR hands are now just the outline of a hand (smooth see-through fill, glowing rim, no bones, joint dots or laser dots), pale cyan #b8f4ff, warm gold #ffe2a0 while pressing. Drawn as a distance-to-edge picture (palm, four fingers, whole thumb) on a world panel in the controller's plane, index fingertip on the poke point; VaM plugins cannot bring custom shaders, so no 3D fresnel.

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
