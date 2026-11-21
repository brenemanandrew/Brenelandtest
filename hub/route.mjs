/* The router: a thought in, a tool + mode + area out, with the reason.
   1. Rules first (free, instant, works offline): hint words from tools.mjs, plus the 3D and motion decision rules below.
   2. If the rules are unsure and a model is set up, the model decides (Claude API, or the PC model for private routing).
   3. If still unsure, it asks Andrew one question instead of guessing. */
import { TOOLS, AREAS, resolve } from './tools.mjs';

const norm = s => ' ' + String(s || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9.' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
const has = (text, w) => text.includes(' ' + w + ' ') || (w.length > 4 && text.includes(' ' + w));

/* ---- 3D: Meshy, Blender, code, or the checker? ----
   The question Andrew asked: "is that Meshy, is it Blender, is it another tool, is it motion capture?" */
export function pick3d(t) {
  const file = /\.(glb|gltf|fbx|obj|vrm|blend)\b/.test(t) || has(t, 'this model') || has(t, 'existing') || has(t, 'my model');
  const pic = has(t, 'picture') || has(t, 'photo') || has(t, 'image') || has(t, 'sketch') || has(t, 'drawing');
  if (['animate', 'animation', 'move', 'moves', 'motion', 'walk', 'dance', 'pose', 'mocap'].some(w => has(t, w))) return null;
  if (['check', 'render', 'clipping', 'holes', 'inspect', 'how does it look'].some(w => has(t, w))) return ['check', 'You want to see or measure a model: the render checker does six close views and the percent of problems.'];
  if (['garment', 'clothing', 'outfit', 'shirt', 'pants', 'hairstyle', 'hair style', 'shell'].some(w => has(t, w)) && has(t, 'breneland') || has(t, 'fit to body') || has(t, 'fit it to')) return ['breneland', 'A garment or hair for the character builder: the Breneland fit pipeline in Blender.'];
  const making = ['make a', 'make an', 'generate', 'new model', 'create a', 'build a', 'model of', 'i need a'].some(w => has(t, w)) && !file;
  if (['retexture', 'repaint', 'reskin', 'recolor', 'recolour'].some(w => has(t, w)) || (!making && ['cel shade', 'cel shaded', 'toon', 'texture'].some(w => has(t, w)))) return ['retexture', 'New paint on a model that already exists: Meshy retexture.'];
  if (['decimate', 'reduce', 'polycount', 'poly count', 'convert', 'bake', 'uv', 'clean up', 'shrink', 'compress', 'merge', 'blender'].some(w => has(t, w)) || (file && !has(t, 'rig'))) return ['process', 'Changing a model you already have: headless Blender on your PC.'];
  if (['rig', 'skeleton', 'bones', 'skin weights'].some(w => has(t, w))) return ['rig', file ? 'Rigging a model you have: Meshy auto-rig (Blender if it needs hand fixes).' : 'Rigging: Meshy auto-rig.'];
  if (['in code', 'procedural', 'simple shape', 'low poly prop', 'primitive', 'built in code'].some(w => has(t, w))) return ['procedural', 'Simple shapes are cheaper and cleaner built in Three.js code, like the 38 props.'];
  if (pic || ['generate', 'new model', 'make a model', 'model of', 'asset', 'prop', 'creature', 'character model', 'statue', 'tree', 'plant', 'building', 'weapon', 'furniture'].some(w => has(t, w))) return ['generate', pic ? 'Something new from a picture: Meshy image to 3D.' : 'Something new from words: Meshy text to 3D (preview first).'];
  return null;
}

/* ---- Motion: capture, library, retarget, or hand-made? ---- */
export function pickMotion(t) {
  const target = has(t, 'wizra') || has(t, 'vrm') || has(t, 'brenai') ? 'vrm' : has(t, 'breneland') || has(t, 'mixamo rig') || has(t, 'townsfolk') ? 'mixamo66' : null;
  const out = (mode, why) => [mode, why, target];
  if (['retarget', 'onto the other', 'to vrm', 'to mixamo', 'other skeleton', 'other rig'].some(w => has(t, w))) return out('retarget', 'Moving a clip between rigs: retarget in Blender.');
  if (['mocap', 'motion capture', 'record me', 'act it out', 'act out', 'my moves', 'on camera', 'from a video', 'from video', 'film myself', 'webcam', 'like i do', 'the way i'].some(w => has(t, w))) return out('capture', 'A move only you can show: the mocap page (camera, video or photos).');
  if (['gesture', 'fidget', 'blink', 'nod', 'shrug', 'small motion', 'twitch', 'breathing', 'look around'].some(w => has(t, w))) return out('handkey', 'Small, repeatable motion: written in code like her 25 gestures.');
  if (['walk', 'run', 'jump', 'dance', 'sit', 'idle', 'mixamo', 'stock', 'cycle', 'punch', 'kick', 'climb', 'wave', 'animation', 'animate'].some(w => has(t, w))) return out('library', 'A common move: take it from the Mixamo or Meshy library and convert it to the rig.');
  return null;
}

/* ---- rules ---- */
export function ruleRoute(thought) {
  const t = norm(thought);
  const area = Object.entries(AREAS).map(([id, a]) => [id, a.words.filter(w => has(t, w)).length]).sort((a, b) => b[1] - a[1]);
  const scores = [];
  for (const tl of TOOLS) for (const [mid, m] of Object.entries(tl.modes)) {
    const hits = m.words.filter(w => has(t, w));
    if (hits.length) scores.push({ tool: tl.id, mode: mid, score: hits.reduce((s, w) => s + (w.includes(' ') ? 2 : 1), 0), hits });
  }
  scores.sort((a, b) => b.score - a.score);
  let best = scores[0] || null, why = best ? `matched: ${best.hits.join(', ')}` : '', target = null;

  /* the 3D and motion rules beat raw word counts when they fire */
  const is3d = ['model', 'mesh', '3d', 'meshy', 'blender', 'glb', 'fbx', 'asset', 'prop', 'texture', 'rig', 'decimate', 'retexture', 'cel shade', 'statue'].some(w => has(t, w)) || /\.(glb|fbx|obj|vrm|blend)\b/.test(t);
  const isMotion = ['animation', 'animate', 'mocap', 'motion', 'gesture', 'retarget', 'clip', 'dance', 'walk cycle', 'act it out', 'on camera', 'fidget'].some(w => has(t, w)) || (best && best.tool === 'motion');
  const motion = isMotion && pickMotion(t);
  const m3 = !motion && is3d && pick3d(t);
  if (motion) { best = { tool: 'motion', mode: motion[0], score: 5 }; why = motion[1]; target = motion[2]; }
  else if (m3) { best = { tool: 'make3d', mode: m3[0], score: 5 }; why = m3[1]; }

  /* feelings words with no task words go to the Companion, even if a work word is present ("my boss is a jerk") */
  const feel = AREAS.personal.words.filter(w => has(t, w)).length;
  const taskish = scores.some(s => s.tool !== 'companion' && s.score >= 2);
  if (feel && !taskish && !motion && !m3) {
    const c = scores.find(s => s.tool === 'companion');
    best = c ? { ...c, score: c.score + 2 } : { tool: 'companion', mode: 'vent', score: 2 };
    why = 'Sounds like feelings, not a task: kept on your PC model.';
  }
  /* kaizen, A3 and similar always go to the expert even inside a plan request */
  const lean = scores.find(s => s.tool === 'expert' && s.mode === 'kaizen');
  if (lean && best && (best.tool === 'planner' || best.tool === 'expert')) { best = lean; why = `Lean method asked for (${lean.hits.join(', ')}): the Kaizen expert.`; }

  const confidence = !best ? 0 : best.score >= 4 ? 0.9 : best.score >= 2 ? 0.7 : 0.45;
  const alts = scores.filter(s => !(best && s.tool === best.tool && s.mode === best.mode)).slice(0, 3).map(s => resolve(s.tool, s.mode));
  return { by: 'rules', area: area[0][1] ? area[0][0] : (best && best.tool === 'companion' ? 'personal' : null), pick: best && resolve(best.tool, best.mode), target, why, confidence, alts };
}

/* ---- model routing, when the rules are unsure ---- */
const CATALOGUE = () => TOOLS.map(t => `${t.id} (${t.name}): ${t.what}\n` + Object.entries(t.modes).map(([k, m]) => `  - ${k}: ${m.does}`).join('\n')).join('\n');
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['tool', 'mode', 'area', 'why', 'question'],
  properties: {
    tool: { type: 'string', enum: TOOLS.map(t => t.id) },
    mode: { type: 'string' },
    area: { type: 'string', enum: ['work', 'hobby', 'personal'] },
    why: { type: 'string', description: 'One short sentence' },
    question: { type: 'string', description: 'One question to ask Andrew if it is still unclear, else empty' },
  },
};

export async function modelRoute(thought, { claude, pcModel } = {}) {
  const sys = `You route Andrew's thoughts to one of his tools. Pick the best tool and mode. Never use em dashes.\n\nTools:\n${CATALOGUE()}`;
  if (claude) {
    const r = await claude.beta.messages.create({
      model: process.env.HUB_ROUTER_MODEL || 'claude-opus-5-5', max_tokens: 1024,
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: sys, messages: [{ role: 'user', content: thought }],
    });
    if (r.stop_reason === 'refusal') return null;
    const txt = r.content.find(b => b.type === 'text');
    return txt ? { ...JSON.parse(txt.text), by: 'claude' } : null;
  }
  if (pcModel) {
    const out = await pcModel(`${sys}\n\nAnswer with JSON only: {"tool","mode","area","why","question"}.`, thought);
    const j = out && out.match(/\{[\s\S]*\}/);
    try { return j ? { ...JSON.parse(j[0]), by: 'pc-model' } : null; } catch { return null; }
  }
  return null;
}

export async function route(thought, opts = {}) {
  const r = ruleRoute(thought);
  if (r.confidence >= 0.7 || opts.rulesOnly) return r.pick ? r : { ...r, question: 'Which tool should this go to?' };
  const m = await modelRoute(thought, opts).catch(e => ({ error: String(e.message || e) }));
  if (m && m.tool && !m.error) {
    const pick = resolve(m.tool, m.mode);
    return { ...r, by: m.by, area: m.area, pick, why: m.why, question: m.question || '', confidence: 0.75 };
  }
  return { ...r, question: r.pick ? `Is this for ${r.pick.label}?` : 'Which tool should this go to?', modelError: m && m.error };
}
