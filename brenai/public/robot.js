// The robot: the owner's panel for editing who she is and how she is right now, from inside the game. It opens from the round
// button on the right edge (the old campsite switch). Every change is saved a moment after you stop typing or let go of a slider,
// and she uses it from her very next reply. The server side is /api/robot (owner only) and /api/agree.
//   WizraRobot.open()   WizraRobot.close()
(function () {
  const $ = id => document.getElementById(id), el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.filter(k => k != null)); return e; };
  document.head.append(el('style', { textContent: `
  #robot { position:fixed; inset:0; z-index:80; display:none; background:rgba(10,6,24,.72); backdrop-filter:blur(4px); font-family:"Fredoka",system-ui,sans-serif; color:#f4eeff; }
  #robot.show { display:block; }
  #robot .box { position:absolute; inset:0; margin:auto; width:min(720px,100%); height:100%; display:flex; flex-direction:column; background:#1b1233; }
  #robot header { display:flex; align-items:center; gap:10px; padding:calc(10px + env(safe-area-inset-top)) 14px 10px; background:#2a1b52; font-size:20px; font-weight:700; }
  #robot header span { flex:1; } #robot header small { font-size:13px; font-weight:500; opacity:.8; }
  #robot header button { border:0; border-radius:12px; background:rgba(255,255,255,.14); color:#fff; font-size:18px; width:44px; height:40px; cursor:pointer; }
  #robot .body { flex:1; overflow-y:auto; padding:12px 14px calc(30px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling:touch; }
  #robot h4 { margin:18px 0 6px; font-size:17px; color:#ffcf6b; } #robot h4:first-child { margin-top:2px; } #robot p.tip { margin:0 0 8px; font-size:14px; opacity:.75; line-height:1.3; }
  #robot textarea, #robot input[type=text], #robot input[type=number] { width:100%; box-sizing:border-box; border:1px solid rgba(255,255,255,.22); border-radius:12px; background:#120b26; color:#fff; font:16px/1.35 inherit; padding:9px 11px; }
  #robot textarea { min-height:74px; resize:vertical; } #robot textarea.tall { min-height:200px; }
  #robot .row { display:flex; align-items:center; gap:10px; margin:6px 0; } #robot .row label { width:118px; font-size:16px; text-transform:capitalize; } #robot .row input[type=range] { flex:1; height:30px; } #robot .row output { width:34px; text-align:right; font-variant-numeric:tabular-nums; } #robot .row .x { width:34px; height:34px; border:0; border-radius:10px; background:rgba(255,255,255,.1); color:#fff; cursor:pointer; }
  #robot .chips { display:flex; flex-wrap:wrap; gap:8px; } #robot .chips button, #robot .act { border:1px solid rgba(255,255,255,.35); border-radius:12px; background:rgba(255,255,255,.08); color:#fff; font:600 16px inherit; padding:9px 14px; cursor:pointer; } #robot .chips button.on { background:linear-gradient(135deg,#f59e0b,#ec4899); border-color:#fff; }
  #robot .is { font-size:14px; opacity:.8; margin:4px 0 8px; }
  ` }));
  const root = el('div', { id: 'robot' }), body = el('div', { className: 'body' }), saved = el('small', { textContent: '' }), xb = el('button', { textContent: '✕', title: 'Close' });
  root.append(el('div', { className: 'box' }, el('header', {}, el('span', { textContent: '🤖 Wizra, under the hood' }), saved, xb), body)); document.body.append(root);
  const post = async (url, b) => (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })).json();
  let D = null, timer = 0, queue = {};
  const place = d => { try { if (d && d.place !== undefined && typeof setPlace === 'function') setPlace(d); } catch {} };
  const flush = async () => { timer = 0; const b = queue; queue = {}; saved.textContent = 'saving…'; try { const d = await post('/api/robot', b); if (d.error) saved.textContent = d.error; else { D = d; saved.textContent = 'saved ✓ applies to her next reply'; place(d); } } catch { saved.textContent = 'not saved (no connection)'; } };
  /* queue a change; sheet fields merge so two quick edits do not overwrite each other */
  const put = (b, now) => { if (b.sheet) { queue.sheet = { ...(queue.sheet || {}), ...b.sheet }; delete b.sheet; } Object.assign(queue, b); clearTimeout(timer); timer = setTimeout(flush, now ? 0 : 600); saved.textContent = '…'; };
  const area = (value, onchange, cls, ph) => { const t = el('textarea', { value: value || '', placeholder: ph || '', className: cls || '' }); t.oninput = () => onchange(t.value); return t; };
  const lines = a => (a || []).join('\n'), unlines = v => v.split(/\n|;/).map(x => x.trim()).filter(Boolean);
  function draw() { const sh = D.sheet; body.textContent = '';
    const H = (t, tip) => { body.append(el('h4', { textContent: t })); if (tip) body.append(el('p', { className: 'tip', textContent: tip })); };
    /* ---- right now ---- */
    H('Right now', 'Her current state, in your words: mood, what is bothering her, what just happened, what she wants. She takes it as true from her next reply, until you change or clear it.');
    body.append(area(D.now, v => put({ now: v }), '', 'e.g. She is stressed about a midterm tomorrow and wants distracting. / She is in a great mood and feeling flirty.'));
    const st = el('div', { className: 'is' }); st.textContent = [D.away ? 'She is out: ' + D.away : 'She is here', D.mood ? 'Mood she came back with: ' + D.mood : 'No leftover mood'].join('  ·  '); body.append(st);
    const acts = el('div', { className: 'chips' }), agree = el('button', { textContent: D.agree ? '🤝 Agreeable: ON' : '🤝 Agreeable: off', className: D.agree ? 'on' : '' });
    agree.onclick = async () => { const d = await post('/api/agree', { on: !D.agree }); Object.assign(D, d); place(d); draw(); };
    const clear = el('button', { textContent: '🧽 Clear her mood' }); clear.onclick = () => { put({ clearMood: true }, true); setTimeout(reload, 500); };
    const fresh = el('button', { textContent: '🌱 Fresh start from here' }); fresh.title = 'She stops reading back the conversation so far, so its tone cannot pull her back. Your chat stays on screen; her notes and memories stay.'; fresh.onclick = () => { put({ fresh: true }, true); fresh.textContent = '🌱 Started fresh'; };
    acts.append(agree, clear, fresh); if (D.away) { const home = el('button', { textContent: '🏠 Bring her home' }); home.onclick = () => { put({ home: true }, true); setTimeout(reload, 500); }; acts.append(home); } body.append(acts);
    H('How she feels about you', 'What she is carrying from your last conversations. Empty means nothing in particular.');
    body.append(area(D.feeling, v => put({ feeling: v }), '', 'e.g. Still glowing from last night. / A little hurt that you forgot her birthday.'));
    H('One-on-one zones', 'Where she likes being touched in one-on-one time. Tap to switch a place between liked and not liked. Her chest, hips and thighs are always off limits.');
    const zs = el('div', { className: 'chips' }), no = new Set(D.noZones || []); for (const [z, name] of [['hair', 'Hair'], ['face', 'Cheek'], ['shoulder', 'Shoulders'], ['arm', 'Arms'], ['hand', 'Hands'], ['belly', 'Belly'], ['knee', 'Knees']]) { const b = el('button', { textContent: (no.has(z) ? '🚫 ' : '💗 ') + name, className: no.has(z) ? '' : 'on' }); b.onclick = () => { no.has(z) ? no.delete(z) : no.add(z); D.noZones = [...no]; put({ noZones: D.noZones }, true); draw(); }; zs.append(b); }
    for (const name of ['Chest', 'Hips', 'Thighs']) zs.append(el('button', { textContent: '🔒 ' + name, disabled: true, style: 'opacity:.45' })); body.append(zs);
    H('Body build', 'Slimmer to the left, heavier set to the right. Thickens hips, thighs, waist, arms and calves on every outfit. 0 is her model as made, 100 is clearly fuller, 250 is very heavy and may show clipping.');
    { const r = el('input', { type: 'range', min: -60, max: 250, value: D.build | 0 }), o = el('output', { textContent: D.build | 0 }); r.oninput = () => { o.textContent = r.value; D.build = +r.value; try { avatar.build(D.build); } catch {} put({ build: D.build }); }; body.append(el('div', { className: 'row' }, el('label', { textContent: 'Build' }), r, o)); }
    H('How freely she talks', 'Safe for work ON tells her to keep everything clean. OFF leaves it to her own judgment as a person. Bleep only hides swear words on your screen. Length is how much she says per reply.');
    { const st = D.settings || {}, row = el('div', { className: 'chips' }), tg = (label, key) => { const b = el('button', { textContent: label + (st[key] ? ': ON' : ': off'), className: st[key] ? 'on' : '' }); b.onclick = () => { st[key] = !st[key]; put({ settings: { [key]: st[key] } }, true); try { settings[key] = st[key]; } catch {} draw(); }; row.append(b); };
      tg('Safe for work', 'sfw'); tg('Bleep swearing', 'bleep'); for (const L of ['short', 'medium', 'long']) { const b = el('button', { textContent: L, className: st.length === L ? 'on' : '' }); b.onclick = () => { st.length = L; put({ settings: { length: L } }, true); try { settings.length = L; } catch {} draw(); }; row.append(b); } body.append(row); }
    /* ---- relationship ---- */
    H('Relationship');
    const lv = el('div', { className: 'chips' }); for (let i = 0; i <= (D.levelMax | 0); i++) { const b = el('button', { textContent: 'Romance L' + i, className: i === sh.romLevel ? 'on' : '' }); b.onclick = () => { sh.romLevel = i; put({ sheet: { romLevel: i } }, true); draw(); }; lv.append(b); } body.append(lv);
    const num = (label, value, max, send) => { const r = el('input', { type: 'range', min: 0, max, value: value | 0 }), o = el('output', { textContent: value | 0 }); r.oninput = () => { o.textContent = r.value; send(+r.value); }; body.append(el('div', { className: 'row' }, el('label', { textContent: label }), r, o)); };
    num('Rapport', sh.rapport, 100, v => put({ sheet: { rapport: v } }));
    for (const k of ['romance', 'friend', 'mentor']) num(k + ' points', (sh.bond || {})[k], k === 'romance' ? Math.max(100, D.need | 0) : 100, v => { sh.bond[k] = v; put({ sheet: { bond: { ...sh.bond } } }); });
    const cuss = el('div', { className: 'chips' }); ['No swearing', 'Mild', 'Swears', 'Swears a lot'].forEach((t, i) => { const b = el('button', { textContent: t, className: i === (sh.cussLevel | 0) ? 'on' : '' }); b.onclick = () => { sh.cussLevel = i; put({ sheet: { cussLevel: i } }, true); draw(); }; cuss.append(b); }); body.append(cuss);
    /* ---- temperament ---- */
    H('Temperament', 'Slide any trait. Add your own with a name: jealousy, clinginess, optimism, anything.');
    const traits = sh.traits || {}, sendT = () => put({ sheet: { traits: { ...traits } } });
    for (const k of Object.keys(traits)) { const r = el('input', { type: 'range', min: 0, max: 100, value: traits[k] }), o = el('output', { textContent: traits[k] }), x = el('button', { className: 'x', textContent: '✕', title: 'Remove' }); r.oninput = () => { traits[k] = +r.value; o.textContent = r.value; sendT(); }; x.onclick = () => { delete traits[k]; sendT(); draw(); }; body.append(el('div', { className: 'row' }, el('label', { textContent: k }), r, o, x)); }
    const nt = el('input', { type: 'text', placeholder: 'New trait name' }), add = el('button', { className: 'act', textContent: '＋ Add' }); add.onclick = () => { const n = nt.value.toLowerCase().replace(/[^a-z0-9 '-]/g, '').trim().slice(0, 28); if (!n || traits[n] !== undefined) return; traits[n] = 50; sh.traits = traits; sendT(); draw(); };
    const reset = el('button', { className: 'act', textContent: '↺ Defaults' }); reset.onclick = () => { sh.traits = { ...D.traitsDefault }; put({ sheet: { traits: sh.traits } }, true); draw(); }; body.append(el('div', { className: 'row' }, nt, add, reset));
    /* ---- who she is ---- */
    H('Likes', 'One per line.'); body.append(area(lines(sh.likes), v => put({ sheet: { likes: unlines(v) } })));
    H('Dislikes', 'One per line.'); body.append(area(lines(sh.dislikes), v => put({ sheet: { dislikes: unlines(v) } })));
    H('Secret likes', 'One per line. Things she has not told you yet.'); body.append(area((sh.hiddenLikes || []).map(h => h.text).join('\n'), v => { const old = sh.hiddenLikes || []; put({ sheet: { hiddenLikes: unlines(v).map(t => old.find(h => h.text === t) || { text: t, revealed: false }) } }); }));
    H('How she has changed', 'One per line. What being with you has changed in her so far. She adds to this herself as you talk; you can edit or clear it.'); body.append(area(lines(sh.growth), v => put({ sheet: { growth: unlines(v) } })));
    H('Backstory'); body.append(area(sh.backstory, v => put({ sheet: { backstory: v } })));
    H('What she knows about you', 'Her notes on you. She reads these every reply.'); body.append(area(D.notes, v => put({ notes: v })));
    H('Core character', 'The full text that tells her who she is. Edit freely. Clearing it puts the original back.' + (D.personaEdited ? ' (Edited.)' : ' (Original.)')); body.append(area(D.persona, v => put({ persona: v }), 'tall'));
    const orig = el('button', { className: 'act', textContent: '↺ Put the original character back' }); orig.onclick = () => { put({ persona: '' }, true); setTimeout(reload, 500); }; body.append(el('div', { className: 'row' }, orig)); }
  async function reload() { try { const r = await fetch('/api/robot'); D = await r.json(); if (D.error) { root.classList.remove('show'); try { addSys(D.error); } catch {} return; } draw(); } catch { saved.textContent = 'could not load'; } }
  async function open() { root.classList.add('show'); saved.textContent = ''; body.textContent = 'Loading…'; await reload(); }
  function close() { if (timer) { clearTimeout(timer); flush(); } root.classList.remove('show'); }
  xb.onclick = close; for (const ev of ['pointerdown', 'pointerup', 'click', 'wheel', 'touchstart', 'touchmove', 'keydown', 'keyup']) root.addEventListener(ev, e => e.stopPropagation());
  window.WizraRobot = { open, close };
})();
