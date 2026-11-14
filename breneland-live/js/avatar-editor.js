// The avatar creator on the start screen (and from "Change name & outfit"): a Mii-like creator with big pictures of each option
// drawn on your own character (avatar-tiles.js) round a live 3D turntable preview. AvatarEditor.mount(root), frame(), randomLook().
// profile = { color, hat, skin, voice, look }, and look's keys are listed at the bottom of docs/CONTRACTS.md.
import {
  SKIN_TONES, HATS, FACE_SHAPES, OUTFITS, HAIR_STYLES, ACCESSORIES, EYE_STYLES, EYE_STYLE_LABELS, BROWS, NOSES, MOUTHS, FACIAL_HAIR, GLASSES, TIES, SHOE_KINDS, POCKETS, BODY_TYPES, FIGURES,
  avatarLook, resolveLook, figureBust, gaitFor,
} from './human.js';
import { el, loadCss } from './util.js';
import { createTiles, TILE_PX } from './avatar-tiles.js';

export const SHIRTS = ['#e0574f', '#f2994a', '#f2c94c', '#6fcf97', '#3f8fd9', '#9b51e0', '#ff8fb8', '#2f3a56', '#ffffff', '#8fd6e8', '#7a4a2e', '#2b2b35'];
export const HAIR_COLORS = ['#2a1c14', '#4a3020', '#7a4a2a', '#a8672c', '#d9a05a', '#f0d27a', '#c9c9c9', '#f2f2f2', '#c4423a', '#ff8fb8', '#9b51e0', '#3f8fd9', '#3fbf7a'];
const EYE_COLORS = ['#231a2a', '#4a3020', '#4a7bb5', '#3f9b6a', '#7a5aa8', '#6b6f78', '#c4423a'];
const PANTS = ['#34405e', '#2e2e36', '#6b5a44', '#c9c3b0', '#3f5f8f', '#5a7f4a', '#9b51e0', '#e0574f', '#f2c94c', '#ffffff'];
const SHOES = ['#3a2f2a', '#e0574f', '#3f8fd9', '#ffffff', '#2b2b35', '#f2c94c', '#6fcf97'];
const HAT_COLORS = ['#e0574f', '#f2994a', '#f2c94c', '#6fcf97', '#3f8fd9', '#9b51e0', '#ff8fb8', '#2f3a56', '#ffffff', '#6b4a2e'];
const ACC_COLORS = ['#e0574f', '#3f8fd9', '#f2c94c', '#6fcf97', '#9b51e0', '#2b2b35', '#ffffff', '#e8743a'];
const TIE_COLORS = ['#c4423a', '#1e1e24', '#3f5f8f', '#2f6b4a', '#f2c94c', '#9b51e0', '#ff8fb8', '#ffffff'];
const INNER_COLORS = ['#ffffff', '#f4ecd8', '#d9c7a3', '#bcd4ee', '#ffd9e6', '#2b2b35'];
const FORMAL = ['suit', 'blazer', 'vest', 'tux', 'gown', 'jacket'];
const HAS_TIE = ['suit', 'blazer', 'vest', 'tux'];
const HAS_INNER = ['suit', 'blazer', 'vest', 'tux', 'jacket'];

export const HAT_LABELS = {
  none: 'None', cap: 'Cap', capback: 'Cap back', beanie: 'Beanie', sunhat: 'Sun hat', bow: 'Bow', tophat: 'Top hat', crown: 'Crown',
  fedora: 'Fedora', party: 'Party', straw: 'Straw', headband: 'Headband', chef: 'Chef',
};
const LABELS = {
  face: { round: 'Round', oval: 'Oval', square: 'Square', heart: 'Heart', chubby: 'Chubby' },
  eyes: { dot: 'Dots', oval: 'Oval', wide: 'Wide', happy: 'Happy', sleepy: 'Sleepy', lash: 'Lashes' },
  brows: { plain: 'Plain', thick: 'Thick', arched: 'Arched', angry: 'Grumpy', soft: 'Soft', none: 'None' },
  nose: { small: 'Small', round: 'Round', long: 'Long', button: 'Button', none: 'None' },
  mouth: { smile: 'Smile', grin: 'Grin', toothy: 'Big grin', flat: 'Flat', o: 'Oh!', cat: 'Cat', smirk: 'Smirk', tiny: 'Tiny' },
  glasses: { none: 'None', round: 'Round', square: 'Square', shades: 'Shades' },
  facial: { none: 'None', stubble: 'Stubble', mustache: 'Moustache', goatee: 'Goatee', beard: 'Beard', scruff: 'Goatee and stubble', vandyke: 'Van Dyke', boxed: 'Boxed beard', chinstrap: 'Chin strap', longbeard: 'Long beard', muttonchops: 'Mutton chops' },
  hair: { short: 'Short', buzz: 'Buzz', spiky: 'Spiky', side: 'Side swept', bob: 'Bob', long: 'Long', pony: 'Ponytail', pigtails: 'Pigtails', bun: 'Bun', curly: 'Curly', afro: 'Afro', mohawk: 'Mohawk', balding: 'Thinning', wavy: 'Wavy', sidepart: 'Side part', pompadour: 'Pompadour', shag: 'Shag', tiedback: 'Tied back', bald: 'Bald' },
  outfit: { tee: 'Tee', hoodie: 'Hoodie', overalls: 'Overalls', dress: 'Dress', skirt: 'Skirt', coat: 'Coat', tank: 'Tank', suit: 'Suit', blazer: 'Blazer', vest: 'Waistcoat', tux: 'Tuxedo', gown: 'Gown', jacket: 'Work jacket' },
  tie: { none: 'None', tie: 'Tie', bow: 'Bow tie', skinny: 'Skinny tie' },
  shoeKind: { sneakers: 'Sneakers', dress: 'Dress shoes', boots: 'Boots' },
  pocket: { none: 'None', square: 'Pocket square', flower: 'Flower' },
  bottoms: { pants: 'Long', shorts: 'Shorts' },
  acc: { none: 'None', scarf: 'Scarf', backpack: 'Backpack', bowtie: 'Bow tie', headphones: 'Headphones', satchel: 'Satchel' },
  body: { m: 'Male', f: 'Female', nb: 'Non-binary' },
  figure: { average: 'Average', slim: 'Slim', curvy: 'Curvy', pear: 'Pear', athletic: 'Athletic', plus: 'Plus size' },
};

const outfitShoe = f => (['suit', 'tux', 'vest', 'gown'].includes(f) ? 'dress' : f === 'jacket' ? 'boots' : 'sneakers');
const rand = list => list[Math.floor(Math.random() * list.length)];
const weighted = pairs => { let t = pairs.reduce((s, p) => s + p[1], 0), r = Math.random() * t; for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[0][0]; };

// the look keys for an eye style: 'button' (the printed eyes) is no key at all
const eyeStyleKey = v => (v && v !== 'button' ? { eyeStyle: v } : {});

// A whole random person (used for brand-new visitors and the dice button). Returns the profile fields.
export function randomLook() {
  // a body type first (every choice below stays open to every body, only the odds lean a little)
  const body = weighted([['m', 4], ['f', 4], ['nb', 1.2]]), fem = body === 'f' ? 1 : body === 'm' ? 0 : 0.5;
  const shape = body === 'nb' ? Math.round((0.25 + Math.random() * 0.5) * 100) / 100 : fem;
  const hairStyle = rand(HAIR_STYLES);
  const outfit = weighted([['tee', 4], ['hoodie', 2], ['overalls', 1.5], ['dress', 0.3 + 2.4 * fem], ['skirt', 0.2 + 1.6 * fem], ['coat', 1], ['tank', 1], ['suit', 0.5], ['blazer', 0.5], ['vest', 0.4], ['tux', 0.5 - 0.4 * fem], ['gown', 0.1 + 0.6 * fem], ['jacket', 0.5]]);
  return {
    color: rand(SHIRTS), hat: weighted([['none', 6], ...HATS.filter(h => h !== 'none').map(h => [h, 0.5])]), skin: Math.floor(Math.random() * SKIN_TONES.length),
    voice: Math.floor(Math.random() * 3),
    look: {
      face: rand(FACE_SHAPES), eyes: 'dot', ...eyeStyleKey(rand(EYE_STYLES)), eyeCol: rand(EYE_COLORS), brows: rand(BROWS.filter(b => b !== 'none')), nose: rand(NOSES), mouth: rand(MOUTHS.filter(m => m !== 'o')),
      blush: Math.random() < 0.5, glasses: weighted([['none', 6], ['round', 1], ['square', 1], ['shades', 0.7]]),
      body, shape, figure: weighted([['average', 5], ['slim', 1.2], ['curvy', 1 + fem], ['pear', 0.6 + 0.6 * fem], ['athletic', 1.2], ['plus', 1]]),
      facial: weighted([['none', 7], ['stubble', 0.06 + 0.84 * (1 - fem)], ['mustache', 0.06 + 0.84 * (1 - fem)], ['goatee', 0.05 + 0.65 * (1 - fem)], ['beard', 0.06 + 0.84 * (1 - fem)], ['vandyke', 0.03 + 0.4 * (1 - fem)], ['boxed', 0.04 + 0.6 * (1 - fem)], ['chinstrap', 0.02 + 0.3 * (1 - fem)], ['longbeard', 0.02 + 0.3 * (1 - fem)], ['muttonchops', 0.02 + 0.3 * (1 - fem)]]),
      hair: rand(HAIR_COLORS.slice(0, 10)), hairStyle, hatColor: rand(HAT_COLORS),
      build: Math.round(Math.random() * 100) / 100, height: Math.round((0.2 + Math.random() * 0.6) * 100) / 100,
      outfit, bottoms: outfit === 'dress' || outfit === 'skirt' || FORMAL.includes(outfit) ? 'pants' : weighted([['pants', 3], ['shorts', 1]]),
      ...(FORMAL.includes(outfit) ? { tieCol: rand(TIE_COLORS), pocket: weighted([['none', 3], ['square', 1], ['flower', 1]]) } : {}),
      pants: rand(PANTS), shoes: rand(SHOES), acc: weighted([['none', 6], ...ACCESSORIES.filter(a => a !== 'none').map(a => [a, 0.5])]), accCol: rand(ACC_COLORS),
    },
  };
}

// the creator's sections, an icon and a name each. Each is a column of groups: picture tiles, swatches, sliders.
const TABS = [['face', 'Face', '\u{1F642}'], ['hair', 'Hair', '\u{1F487}'], ['body', 'Body', '\u{1F9CD}'], ['outfit', 'Outfit', '\u{1F455}'], ['extras', 'Extras', '\u{1F452}'], ['voice', 'Voice', '\u{1F5E3}']];
const HISTORY = 60;   // undo steps kept
const snapOf = p => JSON.stringify({ color: p.color, hat: p.hat, skin: p.skin, voice: p.voice, look: p.look || {} });

export class AvatarEditor {
  // opts: { profile, voices: [{label,pitch,formant}], onChange(), onVoice(voiceIndex) }
  constructor(opts) {
    Object.assign(this, opts);
    this.tab = 'face';
    this.spin = 0; this.spinV = 0; this.zoom = 0; this.waveT = -1; this.t = 0;
    this.syncers = [];
    this.tileGroups = [];   // { panel, field, refresh() }: the picture tiles, asked for only while their section shows
    this.undoStack = []; this.redoStack = []; this.lastMark = 0;
    this.tiles = createTiles(() => window.breneland?.renderer || null);
    this.view = { on: false, fov: 0 };
    this.pending = false;
    loadCss('/css/editor.css');
  }

  // ---------------------------------------------------------------- profile helpers

  get look() { return (this.profile.look ||= {}); }

  // Older profiles have no look: freeze what they currently look like, so changing the shirt later does not re-roll the face.
  materialize() {
    const p = this.profile, L = this.look;
    const r = resolveLook(avatarLook(p));
    const fill = (k, v) => { if (L[k] === undefined) L[k] = v; };
    fill('face', r.faceShape); fill('eyes', r.eyes); fill('brows', r.brows); fill('nose', r.nose); fill('mouth', r.mouth); fill('blush', r.blush);
    fill('hairStyle', r.hairStyle); fill('hair', r.hair); fill('build', Math.round(r.build * 100) / 100); fill('height', Math.round(r.height * 100) / 100);
    fill('outfit', r.outfit === 'coat' ? 'tee' : r.outfit); fill('pants', r.pants); fill('shoes', r.shoes); fill('hatColor', r.hatColor);
    fill('glasses', r.glasses); fill('facial', r.facialHair); fill('bottoms', r.bottoms); fill('acc', r.acc);
    fill('body', r.body); fill('shape', r.shape); // older profiles: non-binary at the neutral shape, exactly the body they had
    if (typeof L.glasses === 'boolean') L.glasses = L.glasses ? 'round' : 'none';
  }

  changed() {
    for (const s of this.syncers) s();
    this.refreshTiles();
    if (this.pending) return;
    this.pending = true;
    const go = () => { this.pending = false; this.onChange?.(); };
    if (typeof requestAnimationFrame === 'function' && document.visibilityState === 'visible') requestAnimationFrame(go); else setTimeout(go, 0);
  }

  // Undo: the look as it was before a change. A slider drag is one step (changes within 600 ms of the last join it).
  mark(drag = false) {
    const now = performance.now(), s = snapOf(this.profile);
    if ((!(drag || this.dragging) || now - this.lastMark > 600) && this.undoStack[this.undoStack.length - 1] !== s) { this.undoStack.push(s); if (this.undoStack.length > HISTORY) this.undoStack.shift(); this.redoStack.length = 0; }
    this.lastMark = now;
  }
  restore(s) { const v = JSON.parse(s); Object.assign(this.profile, { color: v.color, hat: v.hat, skin: v.skin, voice: v.voice }); this.profile.look = v.look; this.lastMark = 0; this.changed(); }
  undo() { if (!this.undoStack.length) return false; this.redoStack.push(snapOf(this.profile)); this.restore(this.undoStack.pop()); return true; }
  redo() { if (!this.redoStack.length) return false; this.undoStack.push(snapOf(this.profile)); this.restore(this.redoStack.pop()); return true; }

  setLook(key, value, drag = false) { this.mark(drag); this.look[key] = value; this.changed(); }
  setProfile(key, value) { this.mark(); this.profile[key] = value; this.changed(); }

  randomize() {
    this.mark(); this.lastMark = 0;
    const r = randomLook();
    const keepVoice = this.profile.voice;
    Object.assign(this.profile, { color: r.color, hat: r.hat, skin: r.skin, voice: keepVoice });
    this.profile.look = r.look;
    this.changed();
    this.playWave();
  }

  playWave() { this.waveT = 0; }

  // the tiles of the section on screen ask for their pictures (anything still waiting for another section is dropped)
  refreshTiles() {
    this.tiles.cancel();
    for (const g of this.tileGroups) if (g.panel === this.tab && !g.field.hidden) g.refresh();
  }

  // ---------------------------------------------------------------- controls

  // Build the controls into `root` (an empty element inside the start panel). Called each time the panel opens.
  mount(root) {
    root.replaceChildren();
    this.root = root;
    this.syncers = [];
    this.tileGroups = [];
    this.materialize();
    const profile = this.profile;

    // ---- small builders
    const field = (parent, label, extra = '') => {
      const f = el('div', 'field ' + extra);
      f.append(el('span', 'ed-label', label));
      parent.append(f);
      return f;
    };
    // Radio group: roving tabindex, arrow keys move and select (in a grid of tiles up and down go a row). `items` = [[value, label], ...]
    const radioGroup = (cls, name, items, get, set, make) => {
      const wrap = el('div', cls, '', { role: 'radiogroup', 'aria-label': name });
      const buttons = items.map(([value, label], i) => {
        const b = make(value, label, i);
        b.setAttribute('role', 'radio');
        b.onclick = () => { set(value, i); };
        wrap.append(b);
        return [b, value];
      });
      wrap.addEventListener('keydown', e => {
        let k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!k) return;
        e.preventDefault();
        const cur = Math.max(0, buttons.findIndex(([b]) => b === document.activeElement));
        if (wrap.classList.contains('tiles') && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { // a row of tiles: as many as share the first one's top
          const top0 = buttons[0][0].offsetTop, cols = Math.max(1, buttons.filter(([b]) => b.offsetTop === top0).length);
          const j = cur + k * cols;
          if (j < 0 || j >= buttons.length) return;
          k = j - cur;
        }
        const nxt = buttons[(cur + k + buttons.length) % buttons.length];
        nxt[0].focus(); nxt[0].click();
      });
      const sync = () => {
        const cur = get();
        let any = false;
        for (const [b, value] of buttons) { const on = value === cur; any ||= on; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; }
        if (!any && buttons[0]) buttons[0][0].tabIndex = 0;
      };
      this.syncers.push(sync); sync();
      return { wrap, buttons };
    };
    // a picture (a canvas from avatar-tiles.js) dropped into a tile's frame
    const showPic = (box, cv) => {
      let c = box.firstChild;
      if (!c) { c = document.createElement('canvas'); c.width = c.height = TILE_PX; box.append(c); }
      const g = c.getContext('2d'); g.clearRect(0, 0, TILE_PX, TILE_PX); g.drawImage(cv, 0, 0);
      box.parentNode?.classList.add('ready');
    };
    // Picture tiles: each option drawn on your own character. variant(id) -> the profile wearing it; frame 'head' | 'hair' | 'body'.
    const tiles = (parent, panel, label, ids, labels, get, set, frame, variant, size = '') => {
      const f = field(parent, label, 'tiles-field');
      const { wrap, buttons } = radioGroup('tiles ' + size, label, ids.map(id => [id, labels[id] || id]), get, set, (v, l) => {
        const b = el('button', 'chip tile', '', { type: 'button', 'aria-label': label + ': ' + l, title: l });
        b.append(el('span', 'pic'), el('span', 'cap', l));
        return b;
      });
      f.append(wrap);
      this.tileGroups.push({ panel, field: f, refresh: () => { for (const [b, id] of buttons) { b.classList.remove('ready'); this.tiles.request(variant(id), frame, cv => showPic(b.firstChild, cv), b); } } });
      return f;
    };
    // a copy of the profile with one change: look keys by name, `$hat` for the profile's own
    const withLook = (k, v, extra = null) => { const p = JSON.parse(JSON.stringify(this.profile)); p.look ||= {}; if (k[0] === '$') p[k.slice(1)] = v; else p.look[k] = v; if (extra) extra(p); return p; };
    const noHat = p => { p.hat = 'none'; };
    // Swatches with a "pick your own" colour on the end. `get` returns the current hex, `set(hex)` stores it.
    const swatches = (parent, label, colors, get, set, custom = true) => {
      const f = field(parent, label);
      const items = colors.map(c => [c, c]);
      const { wrap } = radioGroup('swatches', label, items, () => (colors.includes(get()) ? get() : null), v => set(v), (v, l) => {
        const b = el('button', 'swatch', '', { type: 'button', title: l, 'aria-label': label + ' ' + l });
        b.style.setProperty('--c', v);
        return b;
      });
      if (custom) {
        const c = el('label', 'ed-custom', '', { role: 'radio', title: 'Pick your own colour', 'aria-label': label + ': pick your own' });
        const input = el('input', '', '', { type: 'color', 'aria-label': label + ' custom colour' });
        input.oninput = () => { this.dragging = true; set(input.value.toLowerCase()); this.dragging = false; }; // a colour dragged round the picker is one undo step
        c.append(input);
        wrap.append(c);
        this.syncers.push(() => {
          const cur = get(), own = !colors.includes(cur);
          c.setAttribute('aria-checked', String(own));
          if (/^#[0-9a-f]{6}$/i.test(cur)) input.value = cur;
          if (own) c.style.setProperty('background', cur); else c.style.removeProperty('background');
        });
        this.syncers[this.syncers.length - 1]();
      }
      f.append(wrap);
      return f;
    };
    // A slider with a picture of your character at each end (tap one to jump there). auto: the key may be left unset, and the
    // game picks it from the body (dflt() says what). Once set, a small Auto button takes the key away again.
    const slider = (parent, panel, label, lo, hi, key, dflt = () => 0.5, frame = 'body', auto = false) => {
      const f = field(parent, label, 'slider-field');
      const row = el('div', 'ed-slider');
      const input = el('input', '', '', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': label });
      input.oninput = () => this.setLook(key, Math.round(Number(input.value)) / 100, true);
      const end = (word, v) => { const b = el('button', 'ed-end', '', { type: 'button', 'aria-label': label + ': ' + word, title: word }); b.append(el('span', 'pic'), el('span', 'cap', word)); b.onclick = () => this.setLook(key, v); return b; };
      const a = end(lo, 0), z = end(hi, 1);
      row.append(a, input, z);
      f.append(row);
      if (auto) {
        const ab = el('button', 'chip ed-auto', 'Auto', { type: 'button', title: 'Let the game pick from your body', 'aria-label': label + ': let the game pick' });
        ab.onclick = () => { this.mark(); delete this.look[key]; this.changed(); };
        f.append(ab);
        this.syncers.push(() => { ab.hidden = this.look[key] === undefined; });
      }
      this.syncers.push(() => { const v = Math.round((this.look[key] ?? dflt()) * 100); if (Number(input.value) !== v) input.value = String(v); });
      this.syncers[this.syncers.length - 1]();
      this.tileGroups.push({ panel, field: f, refresh: () => { for (const [b, v] of [[a, 0], [z, 1]]) this.tiles.request(withLook(key, v), frame, cv => showPic(b.firstChild, cv), b); } });
      return f;
    };
    const L = () => this.look;

    // ---- floating tools (over the preview): surprise me, undo, redo, wave; and the turntable's turn buttons
    const fab = el('div', 'ed-fab');
    const tool = (ico, word, aria, fn) => { const b = el('button', 'btn', '', { type: 'button', title: aria, 'aria-label': aria }); b.append(el('span', 'ico', ico), el('span', 'word', word)); b.onclick = fn; fab.append(b); return b; };
    tool('\u{1F3B2}', 'Random', 'Randomise my avatar', () => this.randomize());
    const undoB = tool(String.fromCharCode(0x21B6), 'Undo', 'Undo (Ctrl+Z)', () => this.undo());
    const redoB = tool(String.fromCharCode(0x21B7), 'Redo', 'Redo (Ctrl+Y)', () => this.redo());
    tool('\u{1F44B}', 'Wave', 'Make my avatar wave', () => this.playWave());
    this.syncers.push(() => { undoB.disabled = !this.undoStack.length; redoB.disabled = !this.redoStack.length; });
    this.fab = fab;
    const tabs = el('div', 'ed-tabs', '', { role: 'tablist', 'aria-label': 'Avatar sections' });
    const body = el('div', 'ed-body');
    root.append(tabs, body);

    const panels = {};
    for (const [id, label] of TABS) {
      const p = el('div', 'ed-panel', '', { role: 'tabpanel', id: 'ed-panel-' + id, 'aria-labelledby': 'ed-tab-' + id }); p.hidden = true; panels[id] = p;
      body.append(p);
      void label;
    }
    const tabBtns = TABS.map(([id, label, ico]) => {
      const b = el('button', 'ed-tab', '', { type: 'button', role: 'tab', id: 'ed-tab-' + id, 'aria-controls': 'ed-panel-' + id, title: label });
      b.append(el('span', 'ico', ico), el('span', 'word', label));
      b.onclick = () => this.showTab(id);
      tabs.append(b);
      return [id, b];
    });
    tabs.addEventListener('keydown', e => {
      const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!k) return;
      e.preventDefault();
      const i = TABS.findIndex(([id]) => id === this.tab);
      const nxt = tabBtns[(i + k + TABS.length) % TABS.length];
      nxt[1].focus(); this.showTab(nxt[0]);
    });
    this.showTab = id => {
      this.tab = TABS.some(t => t[0] === id) ? id : 'face';
      for (const [tid, b] of tabBtns) { const on = tid === this.tab; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; panels[tid].hidden = !on; }
      body.scrollTop = 0;
      this.refreshTiles();
    };

    // ---- Face
    {
      const p = panels.face;
      tiles(p, 'face', 'Face shape', FACE_SHAPES, LABELS.face, () => L().face, v => this.setLook('face', v), 'head', v => withLook('face', v, noHat));
      const skinSet = i => { this.mark(); profile.skin = i; delete this.look.skinCol; this.changed(); };
      const f = field(p, 'Skin tone');
      const { wrap: skinWrap } = radioGroup('swatches', 'Skin tone', SKIN_TONES.map((c, i) => [i, c]), () => (L().skinCol ? -1 : profile.skin), skinSet, (v, l, i) => {
        const b = el('button', 'swatch', '', { type: 'button', title: 'Skin tone ' + (i + 1), 'aria-label': 'Skin tone ' + (i + 1) });
        b.style.setProperty('--c', l);
        return b;
      });
      const skinCustom = el('label', 'ed-custom', '', { role: 'radio', title: 'Pick your own skin tone', 'aria-label': 'Skin tone: pick your own' });
      const skinInput = el('input', '', '', { type: 'color', 'aria-label': 'Custom skin tone' });
      skinInput.oninput = () => { this.mark(true); this.look.skinCol = skinInput.value.toLowerCase(); this.changed(); };
      skinCustom.append(skinInput);
      skinWrap.append(skinCustom);
      this.syncers.push(() => {
        const own = !!L().skinCol;
        skinCustom.setAttribute('aria-checked', String(own));
        skinInput.value = own ? L().skinCol : SKIN_TONES[profile.skin] || SKIN_TONES[0];
        if (own) skinCustom.style.setProperty('background', L().skinCol); else skinCustom.style.removeProperty('background');
      });
      this.syncers[this.syncers.length - 1]();
      f.append(skinWrap);
      // one row: the button eyes (the printed dots) and the real eyes (bodies-eyes.js). The other printed shapes aren't offered,
      // but a saved look keeps the one it has until another eye is picked.
      const eyeAs = (q, v) => { if (v === 'button') { delete q.eyeStyle; q.eyes = 'dot'; } else q.eyeStyle = v; };
      tiles(p, 'face', 'Eyes', EYE_STYLES, EYE_STYLE_LABELS, () => L().eyeStyle || 'button', v => { this.mark(); eyeAs(this.look, v); this.changed(); }, 'head', v => withLook('eyeStyle', v, q => { eyeAs(q.look, v); noHat(q); }));
      swatches(p, 'Eye colour', EYE_COLORS, () => L().eyeCol || EYE_COLORS[0], v => this.setLook('eyeCol', v));
      tiles(p, 'face', 'Brows', BROWS, LABELS.brows, () => L().brows, v => this.setLook('brows', v), 'head', v => withLook('brows', v, noHat));
      tiles(p, 'face', 'Nose', NOSES, LABELS.nose, () => L().nose, v => this.setLook('nose', v), 'head', v => withLook('nose', v, noHat));
      tiles(p, 'face', 'Mouth', MOUTHS, LABELS.mouth, () => L().mouth, v => this.setLook('mouth', v), 'head', v => withLook('mouth', v, noHat));
      tiles(p, 'face', 'Cheeks', ['no', 'yes'], { no: 'Plain', yes: 'Rosy cheeks' }, () => (L().blush ? 'yes' : 'no'), v => this.setLook('blush', v === 'yes'), 'head', v => withLook('blush', v === 'yes', noHat));
      tiles(p, 'face', 'Character', ['no', 'yes'], { no: 'Smooth', yes: 'Smile lines' }, () => (L().lines ? 'yes' : 'no'), v => this.setLook('lines', v === 'yes'), 'head', v => withLook('lines', v === 'yes', noHat));
      tiles(p, 'face', 'Glasses', GLASSES, LABELS.glasses, () => L().glasses || 'none', v => this.setLook('glasses', v), 'head', v => withLook('glasses', v, noHat));
    }
    // ---- Hair (the hair pictures without a hat, so you can see the cut)
    {
      const p = panels.hair;
      tiles(p, 'hair', 'Hair style', HAIR_STYLES, LABELS.hair, () => L().hairStyle, v => this.setLook('hairStyle', v), 'hair', v => withLook('hairStyle', v, noHat));
      swatches(p, 'Hair colour', HAIR_COLORS, () => L().hair, v => this.setLook('hair', v));
      tiles(p, 'hair', 'Facial hair', FACIAL_HAIR, LABELS.facial, () => L().facial || 'none', v => this.setLook('facial', v), 'head', v => withLook('facial', v, noHat));
    }
    // ---- Body: the body type, then the figure and the sliders (Male and Female set the shape; Non-binary shows the slider)
    {
      const p = panels.body;
      tiles(p, 'body', 'Body type', BODY_TYPES, LABELS.body, () => L().body || 'nb', v => {
        this.mark(); const L0 = this.look; L0.body = v;
        if (v === 'm') L0.shape = 0; else if (v === 'f') L0.shape = 1; else if (!Number.isFinite(L0.shape)) L0.shape = 0.5;
        this.changed();
      }, 'body', v => withLook('body', v, q => { q.look.shape = v === 'm' ? 0 : v === 'f' ? 1 : Number.isFinite(q.look.shape) ? q.look.shape : 0.5; }), 'wide');
      const shapeRow = slider(p, 'body', 'Shape', 'Masculine', 'Feminine', 'shape', undefined, 'torso');
      this.syncers.push(() => { shapeRow.hidden = (L().body || 'nb') !== 'nb'; });
      this.syncers[this.syncers.length - 1]();
      // a figure on top of the body type and build, and the bust for a feminine shape (unset: the figure's own)
      tiles(p, 'body', 'Figure', FIGURES, LABELS.figure, () => L().figure || 'average', v => { this.mark(); this.look.figure = v; delete this.look.bust; this.changed(); }, 'torso', v => withLook('figure', v, q => { delete q.look.bust; }), 'wide');
      const bustRow = slider(p, 'body', 'Bust', 'Small', 'Full', 'bust', () => figureBust(L().figure), 'torso');
      this.syncers.push(() => { bustRow.hidden = resolveLook(avatarLook(this.profile)).shape <= 0.5; });
      this.syncers[this.syncers.length - 1]();
      slider(p, 'body', 'Build', 'Slim', 'Round', 'build', undefined, 'torso');
      slider(p, 'body', 'Height', 'Short', 'Tall', 'height');
      // the run style, Scamper .. Light .. Lope .. Heavy, pictured mid-stride. Unset, the game picks it from the body.
      slider(p, 'body', 'Run style', 'Scamper', 'Heavy', 'gait', () => gaitFor(resolveLook(avatarLook(this.profile))), 'run', true);
    }
    // ---- Outfit
    {
      const p = panels.outfit;
      tiles(p, 'outfit', 'Outfit', OUTFITS, LABELS.outfit, () => L().outfit, v => this.setLook('outfit', v), 'body', v => withLook('outfit', v), 'wide');
      swatches(p, 'Top colour', SHIRTS, () => profile.color, v => this.setProfile('color', v));
      const bottoms = tiles(p, 'outfit', 'Bottoms', ['pants', 'shorts'], LABELS.bottoms, () => L().bottoms, v => this.setLook('bottoms', v), 'body', v => withLook('bottoms', v), 'wide');
      this.syncers.push(() => { bottoms.hidden = ['dress', 'skirt', 'gown'].includes(L().outfit); }); this.syncers[this.syncers.length - 1]();
      swatches(p, 'Bottoms colour', PANTS, () => L().pants, v => this.setLook('pants', v));
      tiles(p, 'outfit', 'Shoe style', SHOE_KINDS, LABELS.shoeKind, () => L().shoeKind || outfitShoe(L().outfit), v => this.setLook('shoeKind', v), 'body', v => withLook('shoeKind', v), 'wide');
      swatches(p, 'Shoes', SHOES, () => L().shoes, v => this.setLook('shoes', v));
      // the formal extras only show for outfits that have a shirt front or a lapel
      const only = (f, list) => { this.syncers.push(() => { f.hidden = !list.includes(L().outfit); }); this.syncers[this.syncers.length - 1](); };
      only(swatches(p, 'Shirt underneath', INNER_COLORS, () => L().innerCol || (L().outfit === 'jacket' ? INNER_COLORS[2] : INNER_COLORS[0]), v => this.setLook('innerCol', v)), HAS_INNER);
      only(tiles(p, 'outfit', 'Tie', TIES, LABELS.tie, () => L().tie || (L().outfit === 'tux' ? 'bow' : L().outfit === 'blazer' ? 'none' : 'tie'), v => this.setLook('tie', v), 'body', v => withLook('tie', v), 'wide'), HAS_TIE);
      only(tiles(p, 'outfit', 'Pocket', POCKETS, LABELS.pocket, () => L().pocket || 'none', v => this.setLook('pocket', v), 'body', v => withLook('pocket', v), 'wide'), HAS_INNER);
      only(swatches(p, 'Accent colour', TIE_COLORS, () => L().tieCol || (L().outfit === 'tux' ? '#1e1e24' : TIE_COLORS[0]), v => this.setLook('tieCol', v)), FORMAL);
    }
    // ---- Hat and extras
    {
      const p = panels.extras;
      tiles(p, 'extras', 'Hat', HATS, HAT_LABELS, () => profile.hat || 'none', v => this.setProfile('hat', v), 'hair', v => withLook('$hat', v));
      swatches(p, 'Hat colour', HAT_COLORS, () => L().hatColor, v => this.setLook('hatColor', v));
      tiles(p, 'extras', 'Extra', ACCESSORIES, LABELS.acc, () => L().acc || 'none', v => this.setLook('acc', v), 'body', v => withLook('acc', v), 'wide');
      swatches(p, 'Extra colour', ACC_COLORS, () => L().accCol || ACC_COLORS[0], v => this.setLook('accCol', v));
    }
    // ---- Voice
    {
      const p = panels.voice;
      const f = field(p, 'Voice');
      f.append(radioGroup('chips voices', 'Voice', this.voices.map((v, i) => [i, v.label]), () => profile.voice, i => { this.setProfile('voice', i); this.onVoice?.(i); }, (v, l) => { const b = el('button', 'chip voice', '', { type: 'button' }); b.append(el('span', 'ico', '\u{1F50A}'), el('span', '', l)); return b; }).wrap);
      p.append(el('p', 'ed-note', 'Everyone babbles Sims-style when they talk. Tap one to hear it.'));
    }
    this.showTab(this.tab);
    for (const s of this.syncers) s();

    // Keys typed in the panel belong to the panel: the game's key handler would otherwise swallow Space and the arrow
    // keys (no spaces in names, dead sliders). Enter in the name box means "Step outside". Ctrl+Z / Ctrl+Y undo and redo.
    const start0 = root.closest('#start');
    if (start0 && !start0.dataset.edKeys) {
      start0.dataset.edKeys = '1';
      start0.addEventListener('keydown', e => {
        e.stopPropagation();
        const typing = e.target && e.target.matches && e.target.matches('input:not([type="range"]):not([type="color"]), textarea');
        if (!typing && (e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'y')) { e.preventDefault(); if (e.key === 'y' || e.shiftKey) this.redo(); else this.undo(); }
      });
      const nameIn = document.getElementById('name-input');
      nameIn?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('go')?.click(); } });
    }

    // ---- the stage over the 3D preview (the turntable): drag to turn, tap to wave, the arrows turn it too (keys, a pad)
    const start = root.closest('#start');
    this.startEl = start;
    this.panelEl = root.closest('.start-panel');
    if (start) {
      start.querySelector('.ed-stage')?.remove(); start.querySelector('.ed-fab')?.remove();
      const stage = el('div', 'ed-stage');
      const turnL = el('button', 'ed-turn', String.fromCharCode(0x27F2), { type: 'button', title: 'Turn left', 'aria-label': 'Turn my avatar left' });
      const turnR = el('button', 'ed-turn', String.fromCharCode(0x27F3), { type: 'button', title: 'Turn right', 'aria-label': 'Turn my avatar right' });
      turnL.onclick = e => { e.stopPropagation(); this.spin -= 0.9; };
      turnR.onclick = e => { e.stopPropagation(); this.spin += 0.9; };
      for (const b of [turnL, turnR]) { b.addEventListener('pointerdown', e => e.stopPropagation()); b.addEventListener('pointerup', e => e.stopPropagation()); }
      stage.append(turnL, el('span', 'ed-hint', 'Drag to turn - tap to wave'), turnR);
      let drag = null;
      stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, moved: 0 }; stage.setPointerCapture?.(e.pointerId); });
      stage.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; drag.x = e.clientX; drag.moved += Math.abs(dx); this.spin += dx * 0.012; this.spinV = 0; });
      const up = () => { if (drag && drag.moved < 5) this.playWave(); drag = null; };
      stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', () => { drag = null; });
      start.prepend(fab, stage);
      this.stage = stage;
      if (!this.mo) {
        // when the panel closes, give the game camera back exactly as it was
        this.mo = new MutationObserver(() => { if (this.startEl?.hidden) this.release(); });
        this.mo.observe(start, { attributes: true, attributeFilter: ['hidden'] });
      }
    }
  }

  // ---------------------------------------------------------------- the 3D preview

  release() {
    const b = window.breneland;
    if (b && this.view.on) {
      b.camera.clearViewOffset();
      b.camera.fov = this.view.fov;
      b.camera.updateProjectionMatrix();
    }
    this.view.on = false;
    this.started = false;
    for (const id of ['labels', 'bubbles']) { const l = document.getElementById(id); if (l) l.style.visibility = ''; }
    const ch = b?.player?.character;
    if (ch) ch.lookYaw = 0;
    this.waveT = -1;
  }

  // Called every frame while the start panel is open. Return true if you positioned the camera yourself
  // (a portrait of the avatar), false to leave the orbiting yard view.
  frame(dt, now, camera, player) {
    if (!this.startEl || this.startEl.hidden) return false;
    this.tiles.pump(window.breneland?.mode === 'attract' || window.breneland?.mode === 'menu' ? 8 : 5); // the pictures, a few a frame
    const b = window.breneland;
    const attract = !b || b.mode === 'attract';
    this.t += dt;
    if (!this.started) {
      for (const id of ['labels', 'bubbles']) { const l = document.getElementById(id); if (l) l.style.visibility = 'hidden'; } // no name tags or dog bubbles over the portrait
      this.started = true;
      this.baseYaw = player.yaw;
      this.spin = 0; this.zoom = this.tab === 'face' || this.tab === 'hair' ? 1 : 0;
      this.view.fov = this.view.on ? this.view.fov : camera.fov;
    }
    // free the previous Human's geometry once the game has swapped it for a new one
    if (this._char && this._char !== player.character) { this._char.dispose?.(); }
    this._char = player.character;
    const ch = player.character;
    const calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    // the avatar sways gently (or follows your drag), glances at the camera, and waves when asked
    this.spin *= Math.pow(0.5, dt * 0.35);
    const sway = calm ? 0 : Math.sin(this.t * 0.55) * 0.32;
    const yaw = this.baseYaw + this.spin + sway;
    player.yaw = yaw;
    ch.root.rotation.y = yaw;
    let toCam = Math.atan2(camera.position.x - player.pos.x, camera.position.z - player.pos.z) - yaw;
    toCam -= Math.PI * 2 * Math.round(toCam / (Math.PI * 2));
    ch.lookYaw = Math.max(-0.7, Math.min(0.7, toCam * 0.8));
    let anim = null;
    if (this.waveT >= 0) { this.waveT += dt; if (this.waveT < 2.4) anim = 'wave'; else this.waveT = -1; }
    if (attract) {
      ch.root.position.copy(player.pos);
      ch.update(dt, now, 0, anim);
    } else {
      // "Change name & outfit": the game already runs the player; ask it for the wave
      if (anim === 'wave' && player.emote !== 'wave') player.playEmote('wave', now);
      if (!anim && player.emote === 'wave') player.emote = null;
    }

    // camera: in front of the avatar, sized to fit the part of the screen the panel leaves free
    const face = this.tab === 'face' || this.tab === 'hair';
    this.zoom += ((face ? 1 : 0) - this.zoom) * Math.min(1, dt * 4);
    const W = innerWidth, H = innerHeight;
    const side = typeof matchMedia === 'function' && (matchMedia('(min-width: 900px) and (min-height: 560px)').matches || matchMedia('(max-height: 559px) and (min-width: 700px)').matches);
    const pr = this.panelEl?.getBoundingClientRect();
    let cx = W / 2, cy = H / 2, frac = 1;
    if (pr && pr.width > 0) {
      if (side) { cx = Math.max(80, pr.left) / 2; frac = Math.min(1, Math.max(80, pr.left) / (W * 0.5)); }
      else { cy = Math.max(120, pr.top) / 2; frac = Math.max(120, pr.top) / H; }
    }
    const tanH = Math.tan(34 * Math.PI / 360);
    const extent = 2.55 - 0.6 * this.zoom;                       // metres of avatar to fit in view
    const dist = Math.min(14, extent / (0.9 * frac * 2 * tanH));
    const look = 1.0 + 0.3 * this.zoom, up = 1.1 + 0.25 * this.zoom + dist * 0.03;
    const fx = Math.sin(this.baseYaw), fz = Math.cos(this.baseYaw);
    const px = player.pos.x, py = player.pos.y, pz = player.pos.z;
    const off = 0.45 * (1 - this.zoom) * Math.min(1, dist / 4);
    camera.position.set(px + fx * dist + fz * off, py + up, pz + fz * dist - fx * off);
    camera.lookAt(px, py + look, pz);
    if (!this.view.on) { this.view.fov = camera.fov; this.view.on = true; }
    camera.fov = 34;
    camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
    return true;
  }
}
