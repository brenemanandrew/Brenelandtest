/* Split jobs: one request, several parts, put back together at the end.

   "Make me a game where you run a tavern, guests come in and order, you get paid, and use cel-shaded visuals like my trees"
     -> mechanics (the rules of the game)      go to Claude Code
     -> art (looks, style, references)         goes to Meshy / Blender / you
     -> story (names, lore, dialogue)          goes to the PC model
     -> a contract of SLOTS between them: neutral ids, file formats and limits, never the content

   Claude Code is told to load every slot from a file, make stand-ins, and send back a MERGE MANIFEST
   (hub-merge.json) saying where each slot lives and how to test the build. The PC worker then drops the real
   files in, checks them and runs the test.

   Splitting runs here, by rules, so your full request is never sent to an outside model to be split.
   Lines starting with "art:", "visuals:", "story:" or "code:" are put where they say. */

const lc = s => ' ' + s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
const has = (t, w) => t.includes(' ' + w + ' ');

const ART = ['visual', 'visuals', 'look', 'looks', 'looking', 'style', 'styled', 'art', 'cel', 'cel shaded', 'toon', 'shaded', 'color', 'colors', 'colour', 'colours', 'palette', 'texture', 'textures', 'aesthetic', 'pixel', 'low poly', 'sprite', 'sprites', 'like my', 'vibe', 'graphics', 'lighting', 'mood board', 'reference', 'art style', 'outfit', 'outfits', 'wearing', 'hair', 'pretty', 'cute', 'gritty', 'dark fantasy', 'painted'];
const STORY = ['story', 'lore', 'backstory', 'plot', 'named', 'called', 'personality', 'history', 'legend', 'dialogue', 'dialog', 'lines', 'script', 'narrative', 'tone', 'setting', 'world building', 'his name', 'her name', 'their name', 'who is'];
const VERBS = ['use', 'make', 'have', 'has', 'with', 'it', 'its', 'the', 'they', 'you', 'there', 'then', 'give', 'add'];

/* slot types: what the code needs to know, nothing else */
export const SLOT_TYPES = {
  character: { dir: 'models', ext: 'glb', format: 'GLB', spec: 'humanoid, 66-bone Mixamo skeleton, under 15000 triangles, 1 unit = 1 m, feet at the origin, facing +Z', side: 'art',
    words: ['guest', 'guests', 'customer', 'customers', 'npc', 'npcs', 'enemy', 'enemies', 'monster', 'monsters', 'character', 'characters', 'hero', 'villager', 'villagers', 'people', 'person', 'creature', 'creatures', 'player', 'boss', 'shopkeeper', 'pet', 'pets'] },
  environment: { dir: 'models', ext: 'glb', format: 'GLB', spec: 'static scene, under 60000 triangles, 1 unit = 1 m, floor at y = 0, centred on the origin', side: 'art',
    words: ['tavern', 'room', 'world', 'level', 'levels', 'map', 'town', 'village', 'forest', 'dungeon', 'shop', 'house', 'arena', 'castle', 'island', 'farm', 'kitchen', 'bar', 'inn'] },
  props: { dir: 'models', ext: 'glb', format: 'GLB', spec: 'one model per item, under 3000 triangles each, 1 unit = 1 m, resting on y = 0', side: 'art', many: true,
    words: ['item', 'items', 'prop', 'props', 'weapon', 'weapons', 'furniture', 'food', 'drink', 'drinks', 'chest', 'tools', 'coins', 'loot', 'ingredients', 'potion', 'potions', 'mug', 'mugs', 'table', 'tables'] },
  icons: { dir: 'images', ext: 'png', format: 'PNG', spec: '128 x 128, transparent background', side: 'art', many: true, words: ['icon', 'icons', 'inventory', 'hud', 'menu'] },
  names: { dir: 'data', ext: 'json', format: 'JSON', side: 'story', schema: { entities: [{ id: 'string (the slot or entity id)', name: 'string', blurb: 'string, optional, shown in game' }] }, words: [] },
  dialogue: { dir: 'data', ext: 'json', format: 'JSON', side: 'story', schema: { lines: [{ id: 'string', speaker: 'entity id', when: 'string event key the code defines', text: 'string', mood: 'string, optional' }] },
    words: ['talk', 'talks', 'dialogue', 'dialog', 'says', 'say', 'conversation', 'chat', 'speak', 'speaks', 'greet', 'greets', 'order', 'orders'] },
  quests: { dir: 'data', ext: 'json', format: 'JSON', side: 'story', schema: { quests: [{ id: 'string', title: 'string', steps: [{ id: 'string', goal: 'string event key the code defines', count: 'number' }], reward: 'number' }] },
    words: ['quest', 'quests', 'mission', 'missions', 'objective', 'objectives', 'task', 'tasks', 'goal', 'goals'] },
};

function clauses(text) {
  const out = [];
  for (const line of String(text).split(/\n+/)) {
    const lab = line.match(/^\s*(art|visuals?|look|story|lore|code|game|rules?)\s*:\s*(.*)$/i);
    if (lab) { const k = lab[1].toLowerCase(); out.push({ text: lab[2].trim(), forced: /^(art|visual|visuals|look)$/.test(k) ? 'art' : /^(story|lore)$/.test(k) ? 'story' : 'code' }); continue; }
    for (const s of line.split(/(?<=[.!?;])\s+|,\s*|\s+-\s+/)) {
      /* split on "and" only when the next words start a new idea ("and use cel-shaded visuals") */
      const bits = s.split(new RegExp(`\\s+and\\s+(?=(?:${VERBS.join('|')})\\b)`, 'i'));
      for (const b of bits) { const c = b.replace(/^\s*(and|then|also|plus)\s+/i, '').replace(/[.;!]+$/, '').trim(); if (c) out.push({ text: c }); }
    }
  }
  return out;
}

function side(c) {
  if (c.forced) return c.forced;
  const t = lc(c.text);
  const a = ART.filter(w => has(t, w)).length, s = STORY.filter(w => has(t, w)).length;
  if (a > s && a) return 'art';
  if (s) return 'story';
  return 'code';
}

/* "only as descriptive as needed": the mechanics lose style words and proper names on the way to Claude */
const STYLE_STRIP = /\b(cel[- ]?shaded|toon|pixel[- ]?art|low[- ]?poly|cute|gritty|pretty|beautiful|dark fantasy|medieval|cozy|spooky|realistic|stylized|stylised|painted|hand[- ]?drawn|colou?rful)\s+/gi;
function neutralize(text, names) {
  let out = text.replace(STYLE_STRIP, '');
  /* Capitalised words that are not the first word: treat as names, swap for a neutral id */
  out = out.replace(/(?<=\S\s+)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, n => {
    if (['I', 'The', 'A', 'An'].includes(n)) return n;
    if (!names.has(n)) names.set(n, `entity_${names.size + 1}`);
    return names.get(n);
  });
  return out.replace(/\s{2,}/g, ' ').trim();
}

export function plan(text) {
  const cs = clauses(text).map(c => ({ ...c, side: side(c) }));
  const names = new Map();
  const mechanics = cs.filter(c => c.side === 'code').map(c => neutralize(c.text.replace(/^(make|build|create)( me)? (a|an) (game|app)( where| in which| that)?\s*/i, ''), names)).filter(Boolean);
  const art = cs.filter(c => c.side === 'art').map(c => c.text);
  const story = cs.filter(c => c.side === 'story').map(c => c.text);

  /* slots from what the whole request mentions; ids are neutral so the code never carries your content */
  const all = lc(text), slots = [], count = {};
  for (const [type, T] of Object.entries(SLOT_TYPES)) {
    const what = T.words.find(w => has(all, w)); if (!what) continue;
    count[type] = (count[type] || 0) + 1;
    const id = `${type}_${count[type]}`;
    slots.push({ id, type, what, path: `assets/hub/${T.dir}/${id}${T.many ? '/' : '.' + T.ext}`, side: T.side });
  }
  if (names.size || story.length || slots.some(s => s.type === 'character')) slots.push({ id: 'names', type: 'names', what: 'names', path: 'assets/hub/data/names.json', side: 'story' });
  return { mechanics, art, story, names: Object.fromEntries(names), slots };
}

const MANIFEST_SHAPE = {
  version: 1,
  slots: [{ id: 'slot id from the list', path: 'where the code loads it, relative to the repo root', format: 'GLB | PNG | JSON', loader: 'file and function that loads it', placeholder: 'path of the stand-in you made', units: 'for models: metres per unit', pivot: 'for models: where the origin is', forward: 'for models: facing axis', clips: ['for rigged models: animation clip names the code plays'], events: ['for data: event keys the code fires that the data can refer to'], notes: 'anything the content must respect' }],
  run: { install: 'command or empty', test: 'a command that exits 0 when the build works', start: 'command to run it' },
  look_at: ['what a person should check by eye after the merge'],
};

export function slotLine(s) {
  const T = SLOT_TYPES[s.type];
  if (T.schema) return `- ${s.id}: ${s.path} (${T.format}). Shape: ${JSON.stringify(T.schema)}`;
  return `- ${s.id}: ${s.path} (${T.format}${T.many ? ', a folder, one file per item, any number' : ''}). ${T.spec}.`;
}

/* The ONLY text Claude Code receives for a split job */
export function codeBrief(p, { id, repo }) {
  return [
    `Repository: ${repo || 'brenemanandrew/Brenelandtest'}. Work on a new branch named hub/${id}. Never push to main. Read AGENTS.md and CLAUDE.md first if they exist.`,
    '',
    'Build this:',
    ...p.mechanics.map(m => `- ${m}`),
    '',
    'All art, names, story and dialogue are made separately and merged in later. Do not write any of them and do not choose a look.',
    'Load each slot below from its file. Make plain stand-ins (grey boxes, capsules, "line 1" text) so the game runs before the real files arrive.',
    'Names in the rules like entity_1 are ids: show the name from names.json, never the id.',
    '',
    'Slots:',
    ...p.slots.map(slotLine),
    '',
    'For the merge, before you finish:',
    `1. Write hub-merge.json at the repo root, shaped like this: ${JSON.stringify(MANIFEST_SHAPE)}`,
    '2. Commit everything on the branch.',
    '3. End your reply with the same JSON inside a ```hub-merge code block.',
    '',
    'Then say what you built, what you tested and what you could not test. Never use em dashes.',
  ].join('\n');
}

/* words from the art and story side that would still reach Claude. Shown on the page before anything is sent. */
const STOP = new Set('a an and the of to in on for with you your my me it its is are be as at by or so this that then them they their there have has use make like game games get gets some one two into from when what will can just also more very'.split(' '));
export function leaks(p) {
  const b = lc(p.mechanics.join(' ') + ' ' + p.slots.map(s => s.id).join(' '));
  const words = new Set([...p.art, ...p.story].flatMap(t => lc(t).trim().split(' ')).filter(w => w.length > 3 && !STOP.has(w)));
  return [...words].filter(w => has(b, w));
}

/* ---- merge checks (used by the worker; kept here so the hub and worker agree) ---- */
export function checkFile(type, buf) {
  const T = SLOT_TYPES[type]; if (!T) return 'unknown slot type';
  if (T.ext === 'glb') return buf.slice(0, 4).toString() === 'glTF' ? null : 'not a GLB file';
  if (T.ext === 'png') return buf.slice(1, 4).toString() === 'PNG' ? null : 'not a PNG file';
  if (T.ext === 'json') {
    let j; try { j = JSON.parse(buf.toString()); } catch { return 'not valid JSON'; }
    const keys = Object.keys(T.schema || {});
    const miss = keys.filter(k => !(k in j)); return miss.length ? `JSON is missing ${miss.join(', ')}` : null;
  }
  return null;
}

/* pull the manifest out of Claude Code's reply if the file was not sent back */
export function manifestFrom(text) {
  const m = String(text || '').match(/```hub-merge\s*([\s\S]*?)```/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

/* what the PC model is asked for: the story slots as JSON, using the mechanics and the neutral ids */
export function storyPrompt(p, slots) {
  return {
    system: 'You write game content as JSON. Output one JSON object and nothing else. Never use em dashes.',
    text: [
      `Story and characters: ${p.story.join('. ') || '(none given, invent something that fits)'}`,
      p.art.length ? `Look and feel: ${p.art.join('. ')}` : '',
      `How the game plays: ${p.mechanics.join('. ')}`,
      `Ids used in the game: ${[...Object.entries(p.names).map(([n, id]) => `${id} = ${n}`), ...p.slots.filter(s => s.side === 'art').map(s => s.id)].join(', ')}`,
      '',
      'Return one object with these keys:',
      ...slots.map(s => `"${s.id}": ${JSON.stringify(SLOT_TYPES[s.type].schema)}`),
    ].filter(Boolean).join('\n'),
  };
}

export function addSlot(p, type) {
  const T = SLOT_TYPES[type]; if (!T) return p;
  const n = p.slots.filter(s => s.type === type).length + 1, id = `${type}_${n}`;
  p.slots.push({ id, type, what: type, path: `assets/hub/${T.dir}/${id}${T.many ? '/' : '.' + T.ext}`, side: T.side });
  return p;
}
