// Wizra's avatar: a small animated SVG puppet. No libraries.
//
// The page only talks to it through this interface, so the real VTuber avatar can replace it later by providing the
// same five calls:
//   const av = WizraAvatar.mount(stageElement)
//   av.setMood(name)       base mood: auto, happy, playful, chill, focused, excited, tired, grumpy, sad, anxious
//   av.setThinking(bool)   she is working on a reply
//   av.talk()              call on every chunk of her reply while it streams (moves the mouth)
//   av.feel(text)          her reply so far: picks a passing expression from her words and actions
//   av.react(kind, dir)    something was done to her: poke, boop, pat, pet, swat, body, spam, wave, laugh, stare, gift
// Touch on the avatar itself (tap, stroke, swipe) is handled in here and calls react().
(function () {
  const SKIN = '#f4ecef', HAIR = '#0b0b10', INK = '#111', LIP = '#4a1f3a';
  const MARKUP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" style="display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none">
  <defs><radialGradient id="wzbg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#3a2a4a"/><stop offset="1" stop-color="#140f1c"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#wzbg)"/>
  <g data-p="hairBack"><path d="M38 114 C30 28 170 28 162 114 L170 204 L30 204 Z" fill="${HAIR}"/></g>
  <g data-p="body">
    <rect x="88" y="118" width="24" height="34" fill="#e6dbe0"/>
    <rect x="87" y="136" width="26" height="6" rx="2" fill="${INK}"/><circle cx="100" cy="144" r="3" fill="#8a7aa0"/>
    <path d="M28 204 C32 162 60 148 100 148 C140 148 168 162 172 204 Z" fill="#2a2234"/>
    <path d="M70 152 C80 172 120 172 130 152" fill="none" stroke="#3d3249" stroke-width="5"/>
    <line x1="88" y1="162" x2="86" y2="190" stroke="#b9b2c4" stroke-width="2"/><line x1="112" y1="162" x2="114" y2="190" stroke="#b9b2c4" stroke-width="2"/>
  </g>
  <g data-p="head">
    <ellipse cx="100" cy="96" rx="34" ry="40" fill="${SKIN}"/>
    <ellipse data-p="blushL" cx="79" cy="110" rx="8" ry="4.5" fill="#e8798e" opacity="0"/><ellipse data-p="blushR" cx="121" cy="110" rx="8" ry="4.5" fill="#e8798e" opacity="0"/>
    <path d="M100 103 L98 111 L101 111" fill="none" stroke="#d8c8cf" stroke-width="1.5"/>
    <g data-p="eyeL"><ellipse data-p="irisL" cx="87" cy="100" rx="3.8" ry="4.2" fill="#3b2f4f"/><circle data-p="glintL" cx="88.3" cy="98.6" r="1.1" fill="#fff"/><path data-p="lidL" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g data-p="eyeR"><ellipse data-p="irisR" cx="113" cy="100" rx="3.8" ry="4.2" fill="#3b2f4f"/><circle data-p="glintR" cx="114.3" cy="98.6" r="1.1" fill="#fff"/><path data-p="lidR" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    <path data-p="browL" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path data-p="browR" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path data-p="mouth" fill="${LIP}" stroke="${LIP}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- front hair: a full cap over the top of the head (no skin showing above the fringe), a choppy fringe, two side locks -->
    <path d="M61 104 C52 30 148 30 139 104 C137 90 131 81 121 77 L115 84 L108 76 L100 84 L92 76 L85 84 L79 77 C69 81 63 90 61 104 Z" fill="${HAIR}"/>
    <path d="M62 96 L57 138 L70 132 Z" fill="${HAIR}"/><path d="M138 96 L143 138 L130 132 Z" fill="${HAIR}"/>
  </g>
  <text data-p="emote" x="150" y="62" font-size="26" text-anchor="middle" opacity="0"></text>
</svg>`;

  // ---- face shapes ----
  const LID = {
    open: x => `M${x - 7} 99 Q${x} 92 ${x + 7} 99`, wide: x => `M${x - 7} 98 Q${x} 89 ${x + 7} 98`, half: x => `M${x - 7} 99 Q${x} 96.5 ${x + 7} 99`,
    shut: x => `M${x - 7} 100 Q${x} 103 ${x + 7} 100`, smile: x => `M${x - 7} 101 Q${x} 94 ${x + 7} 101`,
    squintL: x => `M${x - 6} 95 L${x + 5} 100 L${x - 6} 105`, squintR: x => `M${x + 6} 95 L${x - 5} 100 L${x + 6} 105`,
    dizzy: x => `M${x - 5} 95 L${x + 5} 105 M${x + 5} 95 L${x - 5} 105`,
  };
  const BROW = { // [left, right]
    flat: ['M80 88 L94 87', 'M106 87 L120 88'], angry: ['M80 84 L94 90', 'M106 90 L120 84'], sad: ['M80 90 L94 85', 'M106 85 L120 90'],
    up: ['M80 84 L94 83', 'M106 83 L120 84'], cocked: ['M80 88 L94 87', 'M106 82 L120 84'],
  };
  const MOUTH = {
    flat: 'M92 120 Q100 116 108 120 Q100 125 92 120 Z', smile: 'M90 118 Q100 128 110 118 Q100 122 90 118 Z', grin: 'M89 117 Q100 133 111 117 Z',
    frown: 'M92 124 Q100 116 108 124 Q100 120 92 124 Z', o: 'M96 121 a4 5 0 1 0 8 0 a4 5 0 1 0 -8 0 Z', smirk: 'M92 121 Q101 125 110 116 Q101 121 92 121 Z',
    pout: 'M95 121 Q100 116 105 121 Q100 125 95 121 Z', wavy: 'M92 121 q4 -4 8 0 t8 0', talk: 'M94 119 Q100 128 106 119 Q100 117 94 119 Z', talk2: 'M96 120 a4 3 0 1 0 8 0 a4 3 0 1 0 -8 0 Z',
  };
  // an expression: lids, brows, mouth, blush 0..1, where the eyes rest (gx, gy), head pose (tilt deg, drop px)
  const FACE = {
    neutral: { lid: 'open', brow: 'flat', mouth: 'flat' }, happy: { lid: 'open', brow: 'up', mouth: 'smile' }, playful: { lid: 'open', brow: 'cocked', mouth: 'smirk', tilt: 4 },
    chill: { lid: 'half', brow: 'flat', mouth: 'flat', tilt: -3 }, focused: { lid: 'half', brow: 'angry', mouth: 'flat', gy: 1.5 }, excited: { lid: 'wide', brow: 'up', mouth: 'grin' },
    tired: { lid: 'half', brow: 'sad', mouth: 'pout', tilt: 5, drop: 3, gy: 1.5 }, grumpy: { lid: 'half', brow: 'angry', mouth: 'frown' }, sad: { lid: 'open', brow: 'sad', mouth: 'frown', drop: 2, gy: 2 },
    anxious: { lid: 'wide', brow: 'sad', mouth: 'wavy' }, joy: { lid: 'smile', brow: 'up', mouth: 'grin', blush: 0.5 }, blush: { lid: 'open', brow: 'sad', mouth: 'pout', blush: 1, gx: 2.5, gy: 1.5 },
    surprised: { lid: 'wide', brow: 'up', mouth: 'o' }, flinch: { lid: 'squint', brow: 'sad', mouth: 'wavy' }, dizzy: { lid: 'dizzy', brow: 'sad', mouth: 'o' },
    angry: { lid: 'open', brow: 'angry', mouth: 'frown', blush: 0.4 }, eyeroll: { lid: 'half', brow: 'cocked', mouth: 'flat', gy: -3 }, thinking: { lid: 'open', brow: 'cocked', mouth: 'pout', gx: 2.5, gy: -2.5 },
    suspicious: { lid: 'half', brow: 'cocked', mouth: 'flat', gx: -2.5 },
  };
  // her words and actions -> a passing expression (first match wins)
  const FEEL = [
    [/roll(s|ed|ing)? her eyes|eye ?roll/i, 'eyeroll'], [/blush|fluster|embarrass|looks away|hides her face/i, 'blush'], [/gasp|jaw drops|eyes widen|wait,? what|what\?!|\?!/i, 'surprised'],
    [/glare|scowl|annoyed|huff|scoff|crosses her arms|ugh\b/i, 'grumpy'], [/laugh|giggl|snort|cackl|haha|lmao|\blol\b/i, 'joy'], [/smirk|wink|teas|grin/i, 'playful'],
    [/smil|beam|\bnice\b|love (it|that)|thank/i, 'happy'], [/yawn|sleepy|exhausted|so tired/i, 'tired'], [/frown|sigh|sorry|\bsad\b|tear/i, 'sad'],
    [/nervous|fidget|bites her lip|\bum+\b|\buh+\b/i, 'anxious'], [/squint|narrow(s|ed)? her eyes|suspicious|side-?eye/i, 'suspicious'], [/!!|omg|oh my god|no way|yes!/i, 'excited'], [/hmm+|thinks|ponder|considers/i, 'thinking'],
  ];

  function mount(stage) {
    stage.innerHTML = MARKUP;
    const svg = stage.firstElementChild, P = {};
    svg.querySelectorAll('[data-p]').forEach(n => { P[n.dataset.p] = n; });
    let mood = 'neutral', temp = null, tempUntil = 0, thinking = false, talkUntil = 0, emoteUntil = 0;
    let blinkAt = performance.now() + 2000, blinkEnd = 0, glanceAt = 0, gaze = { x: 0, y: 0 }, look = { x: 0, y: 0 }, pointerLook = null, pointerLookUntil = 0;
    const sp = { rot: { x: 0, v: 0 }, tx: { x: 0, v: 0 }, ty: { x: 0, v: 0 }, sq: { x: 0, v: 0 } }; // springs, rest at 0
    const taps = [];
    const now = () => performance.now();

    function show(face, ms) { temp = face; tempUntil = now() + ms; }
    function emote(ch, ms = 1400) { P.emote.textContent = ch; emoteUntil = now() + ms; }
    function kick(rot = 0, tx = 0, ty = 0, sq = 0) { sp.rot.v += rot; sp.tx.v += tx; sp.ty.v += ty; sp.sq.v += sq; }
    const sour = () => ['grumpy', 'tired', 'sad', 'anxious'].includes(mood);

    function react(kind, dir = 1) {
      if (kind === 'poke') { show('flinch', 500); kick(-dir * 260, -dir * 60); setTimeout(() => { show(sour() ? 'grumpy' : 'surprised', 900); }, 480); }
      else if (kind === 'boop') { show('surprised', 500); kick(0, 0, -40, -3); setTimeout(() => { show('blush', 1800); }, 480); }
      else if (kind === 'pat') { show(sour() ? 'suspicious' : 'joy', 1300); kick(0, 0, 90, -4); if (!sour()) emote('✨', 1000); }
      else if (kind === 'pet') { show(sour() ? 'blush' : 'joy', 700); }
      else if (kind === 'petEnd') { show('joy', 1500); emote('💗', 1500); }
      else if (kind === 'swat') { show('dizzy', 1300); kick(dir * 900, dir * 260, 0, 0); setTimeout(() => { show('angry', 2200); emote('💢', 2000); }, 1250); }
      else if (kind === 'body') { show('suspicious', 1500); emote('❓', 1200); kick(60); }
      else if (kind === 'spam') { show('angry', 2600); emote('💢', 2400); kick(0, 0, 0, 5); }
      else if (kind === 'wave') { show('happy', 1800); kick(120); }
      else if (kind === 'laugh') { show('joy', 2000); kick(0, 0, 60); }
      else if (kind === 'stare') { show('suspicious', 2600); emote('💦', 1600); }
      else if (kind === 'gift') { show('excited', 2200); emote('✨', 1600); kick(0, 0, -70); }
    }

    // ---- touch: tap (where?), stroke over the hair (pet), fast swipe (swat) ----
    let down = null;
    const at = e => { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 200, y: (e.clientY - r.top) / r.height * 200 }; };
    svg.addEventListener('pointerdown', e => { const p = at(e); down = { ...p, sx: p.x, t: now(), path: 0, pet: 0 }; try { svg.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); });
    svg.addEventListener('pointermove', e => {
      const p = at(e); pointerLook = { x: (p.x - 100) / 30, y: (p.y - 100) / 34 }; pointerLookUntil = now() + 1500;
      if (!down) return;
      const d = Math.hypot(p.x - down.x, p.y - down.y); down.path += d;
      if (p.y < 92 && now() - down.t > 250) { down.pet += d; if (down.pet > 30) react('pet'); }
      down.x = p.x; down.y = p.y;
    });
    const up = e => {
      if (!down) return; const p = at(e), d = down, ms = now() - d.t, dx = p.x - d.sx; down = null;
      if (Math.abs(dx) > 55 && ms < 380) return react('swat', Math.sign(dx));
      if (d.pet > 60) return react('petEnd');
      if (d.path > 25) return;
      const t = now(); taps.push(t); while (taps.length && t - taps[0] > 2500) taps.shift();
      if (taps.length >= 4) { taps.length = 0; return react('spam'); }
      if (Math.hypot(p.x - 100, p.y - 108) < 9) return react('boop');
      if (p.y > 150) return react('body');
      if (p.y < 80) return react('pat');
      react('poke', p.x < 100 ? -1 : 1);
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', () => { down = null; });

    // ---- the frame loop ----
    let last = now(), shown = '';
    function frame() {
      const t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
      for (const k in sp) { const s = sp[k]; s.v += (-170 * s.x - 13 * s.v) * dt; s.x += s.v * dt; }
      const face = FACE[(t < tempUntil && temp) || (thinking ? 'thinking' : mood)] || FACE.neutral;
      const talking = t < talkUntil;
      if (t > blinkAt) { blinkEnd = t + 130; blinkAt = t + 1800 + Math.random() * 4200; }
      const blink = t < blinkEnd && !['smile', 'squint', 'dizzy'].includes(face.lid);
      const lid = blink ? 'shut' : face.lid;
      const mouth = talking ? ((t / 130 | 0) % 3 === 0 ? face.mouth : (t / 130 | 0) % 3 === 1 ? 'talk' : 'talk2') : face.mouth;
      const key = lid + face.brow + mouth;
      if (key !== shown) {
        shown = key;
        P.lidL.setAttribute('d', (LID[lid] || LID[lid + 'L'])(87)); P.lidR.setAttribute('d', (LID[lid] || LID[lid + 'R'])(113));
        const eyes = ['open', 'wide', 'half'].includes(lid) ? '' : 'none';
        for (const n of ['irisL', 'irisR', 'glintL', 'glintR']) P[n].style.display = eyes;
        P.browL.setAttribute('d', BROW[face.brow][0]); P.browR.setAttribute('d', BROW[face.brow][1]);
        P.mouth.setAttribute('d', MOUTH[mouth]); P.mouth.setAttribute('fill', mouth === 'wavy' ? 'none' : LIP);
      }
      // eyes: follow the pointer for a moment, else the expression's resting gaze, else a slow idle glance
      if (t > glanceAt) { gaze = Math.random() < 0.5 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2 }; glanceAt = t + 1500 + Math.random() * 3000; }
      const want = t < pointerLookUntil && pointerLook ? pointerLook : (face.gx || face.gy) ? { x: face.gx || 0, y: face.gy || 0 } : gaze;
      look.x += (Math.max(-3, Math.min(3, want.x)) - look.x) * Math.min(1, dt * 10); look.y += (Math.max(-3, Math.min(2.5, want.y)) - look.y) * Math.min(1, dt * 10);
      for (const [n, cx] of [['L', 87], ['R', 113]]) {
        P['iris' + n].setAttribute('cx', cx + look.x); P['iris' + n].setAttribute('cy', 100 + look.y); P['iris' + n].setAttribute('ry', lid === 'half' ? 3 : 4.2);
        P['glint' + n].setAttribute('cx', cx + 1.3 + look.x); P['glint' + n].setAttribute('cy', 98.6 + look.y);
      }
      const blush = face.blush || 0; P.blushL.setAttribute('opacity', blush); P.blushR.setAttribute('opacity', blush);
      // head: springs + pose + breathing; the back hair lags behind for a little sway
      const breathe = Math.sin(t / 900), rot = sp.rot.x * 0.06 + (face.tilt || 0) + (talking ? Math.sin(t / 160) * 0.8 : 0);
      const tx = sp.tx.x * 0.06, ty = sp.ty.x * 0.06 + (face.drop || 0) + breathe * 0.7, sq = 1 - Math.max(-0.12, Math.min(0.12, sp.sq.x * 0.02));
      P.head.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${rot.toFixed(2)} 100 140) translate(0 ${(140 * (1 - sq)).toFixed(2)}) scale(1 ${sq.toFixed(3)})`);
      P.hairBack.setAttribute('transform', `translate(${(tx * 0.5).toFixed(2)} ${(ty * 0.5).toFixed(2)}) rotate(${(rot * 0.45).toFixed(2)} 100 140)`);
      P.body.setAttribute('transform', `translate(0 ${(200 * -0.006 * breathe).toFixed(2)}) scale(1 ${(1 + 0.006 * breathe).toFixed(4)})`);
      const eo = Math.max(0, Math.min(1, (emoteUntil - t) / 300)); P.emote.setAttribute('opacity', eo); P.emote.setAttribute('y', 62 - (1 - eo) * 6);
      if (svg.isConnected) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    return {
      setMood(m) { mood = FACE[m] ? m : 'neutral'; },
      setThinking(b) { thinking = !!b; },
      talk() { talkUntil = now() + 350; thinking = false; },
      feel(text) { text = String(text).slice(-140); for (const [re, face] of FEEL) if (re.test(text)) { show(face, 5000); return face; } return null; },
      react,
    };
  }
  window.WizraAvatar = { mount, markup: MARKUP };
})();
