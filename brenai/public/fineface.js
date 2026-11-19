// The finer parts of her face. Her model (a VRoid one) carries shapes for just the mouth, just the brows and just the eyes, next
// to the whole-face expressions the game normally uses. Motion capture drives these directly, so a small smile, a pressed lip,
// one raised brow line or a squint comes through instead of one big "happy".
//   const fine = fineFace(vrm);   fine.has  -> does this model have them;   fine.set({ mFun: 0.4, bAng: 0.2, ... })  (missing = 0)
// Only shapes that no expression of hers uses are touched here; the vowels and blinks still go through her expressions.
export const FINE = { mFun: 'Fcl_MTH_Fun', mJoy: 'Fcl_MTH_Joy', mSor: 'Fcl_MTH_Sorrow', mAng: 'Fcl_MTH_Angry', mUp: 'Fcl_MTH_Up', mSmall: 'Fcl_MTH_Small', mLarge: 'Fcl_MTH_Large',
  bAng: 'Fcl_BRW_Angry', bSor: 'Fcl_BRW_Sorrow', bSur: 'Fcl_BRW_Surprised', eJoyL: 'Fcl_EYE_Joy_L', eJoyR: 'Fcl_EYE_Joy_R', eWide: 'Fcl_EYE_Surprised' };
export const WHOLE = ['happy', 'angry', 'sad', 'surprised'];   /* the whole-face ones a fine take leaves out */
export function fineFace(vrm) {
  const slots = {}; let n = 0;
  vrm.scene.traverse(m => { const d = m.isMesh && m.morphTargetDictionary; if (!d || !m.morphTargetInfluences) return; for (const k in FINE) if (d[FINE[k]] !== undefined) { (slots[k] = slots[k] || []).push([m, d[FINE[k]]]); n++; } });
  return { has: n > 0 && !!slots.mFun, set(v) { v = v || {}; for (const k in slots) { const x = Math.max(0, Math.min(1, +v[k] || 0)); for (const [m, i] of slots[k]) m.morphTargetInfluences[i] = x; } } };
}
