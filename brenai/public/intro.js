// A new player's first minutes. You are at your computer: the account is made, a few picture questions say what kind of
// company you are after, the service searches, finds a match (her), and you accept or pass. Accepting switches the screen on
// and she opens your first conversation herself. The answers set her temperament for this player only (server: /api/intro).
//   WizraIntro.run({ name, snapshot, fx }) -> resolves with her first line ('' if it could not be fetched) once the player has accepted
(function () {
  const QUESTIONS = [
    { q: 'What kind of energy do you want around?', a: [
      { art: ['🌙', '☕', '🕯️'], bg: 'linear-gradient(160deg,#27306b,#5a4a9a)', t: 'Calm and cozy', d: 'Easygoing, patient, quiet nights' },
      { art: ['✨', '😜', '🎲'], bg: 'linear-gradient(160deg,#a8327a,#f08a4b)', t: 'Playful and teasing', d: 'Jokes, banter, never a dull minute' },
      { art: ['🔥', '⚡', '🖤'], bg: 'linear-gradient(160deg,#7a1024,#e0562f)', t: 'Bold and fiery', d: 'Strong opinions, big presence' } ] },
    { q: 'How should she talk to you?', a: [
      { art: ['💗', '🫶', '🌸'], bg: 'linear-gradient(160deg,#c2487e,#f7a8c4)', t: 'Sweet', d: 'Kind words, soft landings' },
      { art: ['😏', '🙄', '💬'], bg: 'linear-gradient(160deg,#3b2a6b,#8a5fd1)', t: 'Sarcastic', d: 'Dry wit, eye rolls, affection in disguise' },
      { art: ['🎯', '🗡️', '💯'], bg: 'linear-gradient(160deg,#16323f,#2f8f9a)', t: 'Straight up', d: 'Says what she means, no sugar' } ] },
    { q: 'Which one sounds most like your kind of person?', a: [
      { art: ['📚', '🫣', '🎧'], bg: 'linear-gradient(160deg,#2f4a3a,#6fae8a)', t: 'Shy bookworm', d: 'Quiet at first, worth the wait' },
      { art: ['🎮', '🐉', '🤓'], bg: 'linear-gradient(160deg,#28306e,#4f9ad1)', t: 'Nerdy gamer', d: 'Will explain the lore. All of it.' },
      { art: ['🕶️', '🎸', '😈'], bg: 'linear-gradient(160deg,#1b1420,#6b2a55)', t: 'Confident rebel', d: 'Walks in like she owns the place' } ] },
    { q: 'What are you hoping for most?', a: [
      { art: ['🍕', '🛋️', '😂'], bg: 'linear-gradient(160deg,#a85a1c,#f2c14e)', t: 'Someone to hang out with', d: 'Good company, easy laughs' },
      { art: ['🚀', '💪', '📈'], bg: 'linear-gradient(160deg,#1c3a6b,#3fb0d1)', t: 'Someone who pushes me', d: 'Honest, keeps me sharp' },
      { art: ['🌌', '🤝', '💭'], bg: 'linear-gradient(160deg,#3a2466,#b06ad1)', t: 'Someone who gets me', d: 'Listens, remembers, understands' } ] },
  ];
  const css = `
  #intro { position:fixed; inset:0; z-index:60; display:grid; place-items:center; background:radial-gradient(120% 90% at 50% 20%,#2a2350,#0c0a18 70%); font-family:"Fredoka",system-ui,sans-serif; color:#eae6ff; overflow:hidden; }
  #intro .desk { position:absolute; left:0; right:0; bottom:0; height:16vh; background:linear-gradient(#3a2a22,#1f1612); border-top:3px solid #5a4032; }
  #intro .pc { position:relative; width:min(94vw,860px); height:min(78vh,620px); margin-bottom:7vh; display:flex; flex-direction:column; align-items:center; }
  #intro .bezel { flex:1; width:100%; background:#15131f; border:3px solid #3d3860; border-radius:22px; padding:12px; box-shadow:0 0 0 3px #0b0a12, 0 30px 80px rgba(0,0,0,.7), 0 0 90px rgba(140,110,255,.18); display:flex; min-height:0; }
  #intro .stand { width:120px; height:5vh; background:linear-gradient(#2a2640,#15131f); } #intro .foot { width:260px; height:12px; border-radius:8px 8px 0 0; background:#2a2640; }
  #intro .screen { position:relative; flex:1; border-radius:12px; overflow:hidden; background:linear-gradient(165deg,#1d1b4a,#4a2a78 60%,#7a3a8a); display:flex; flex-direction:column; min-height:0; }
  #intro .screen::after { content:""; position:absolute; inset:0; pointer-events:none; background:repeating-linear-gradient(rgba(255,255,255,.035) 0 1px,transparent 1px 3px); }
  #intro .bar { display:flex; align-items:center; gap:8px; padding:7px 12px; background:rgba(10,8,30,.55); font-size:13px; letter-spacing:.04em; } #intro .bar b { font-weight:600; } #intro .bar i { width:10px; height:10px; border-radius:50%; background:#ff6fa5; } #intro .bar i + i { background:#ffd166; } #intro .bar i + i + i { background:#7dff9a; } #intro .bar span { margin-left:auto; opacity:.7; }
  #intro .body { flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; align-items:center; padding:16px; text-align:center; gap:14px; } #intro .body > :first-child { margin-top:auto; } #intro .body > :last-child { margin-bottom:auto; }
  #intro h2 { margin:0; font:400 clamp(22px,4.2vw,34px) "Bangers","Fredoka",sans-serif; letter-spacing:.05em; } #intro p { margin:0; opacity:.85; font-size:15px; max-width:520px; }
  #intro button.go { font:inherit; font-weight:700; font-size:17px; border:0; border-radius:999px; padding:12px 30px; color:#fff; background:linear-gradient(135deg,#a855f7,#ec4899); cursor:pointer; box-shadow:0 5px 0 rgba(0,0,0,.3); }
  #intro .dots { display:flex; gap:7px; } #intro .dots i { width:26px; height:6px; border-radius:4px; background:rgba(255,255,255,.22); } #intro .dots i.on { background:#ffd166; }
  #intro .cards { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; width:100%; max-width:760px; }
  #intro .card { position:relative; border:3px solid rgba(255,255,255,.25); border-radius:20px; padding:16px 10px 14px; color:#fff; cursor:pointer; font:inherit; display:flex; flex-direction:column; align-items:center; gap:6px; transition:transform .15s, border-color .15s, box-shadow .15s; min-height:190px; overflow:hidden; }
  #intro .card:hover, #intro .card:focus-visible { transform:translateY(-5px) rotate(-1deg); border-color:#fff; box-shadow:0 12px 30px rgba(0,0,0,.45); outline:0; } #intro .card.pick { transform:scale(1.06); border-color:#ffd166; box-shadow:0 0 0 4px rgba(255,209,102,.5); }
  #intro .art { position:relative; height:92px; width:100%; } #intro .art span { position:absolute; left:50%; top:50%; line-height:1; filter:drop-shadow(0 4px 6px rgba(0,0,0,.35)); }
  #intro .art span:nth-child(1) { font-size:64px; transform:translate(-50%,-50%); } #intro .art span:nth-child(2) { font-size:34px; transform:translate(-150%,-10%) rotate(-14deg); } #intro .art span:nth-child(3) { font-size:34px; transform:translate(50%,-90%) rotate(12deg); }
  #intro .card strong { font-size:17px; font-weight:700; } #intro .card small { font-size:12.5px; opacity:.9; line-height:1.25; }
  #intro .track { width:min(78%,460px); height:20px; border-radius:999px; background:rgba(10,8,30,.6); border:2px solid rgba(255,255,255,.3); overflow:hidden; } #intro .fill { height:100%; width:0; border-radius:999px; background:linear-gradient(90deg,#7dd3fc,#a855f7,#ec4899); background-size:200% 100%; animation:introSlide 1.2s linear infinite; }
  @keyframes introSlide { to { background-position:-200% 0; } } @keyframes introPop { 0% { transform:scale(.6); opacity:0; } 70% { transform:scale(1.06); } 100% { transform:scale(1); opacity:1; } }
  #intro .radar { width:74px; height:74px; border-radius:50%; border:3px solid rgba(255,255,255,.35); border-top-color:#ffd166; animation:introSpin 1s linear infinite; } @keyframes introSpin { to { transform:rotate(360deg); } }
  #intro .match { display:flex; gap:18px; align-items:stretch; text-align:left; max-width:680px; width:100%; animation:introPop .5s ease-out; }
  #intro .photo { flex:none; width:min(38%,230px); aspect-ratio:4/5; border-radius:18px; border:4px solid #fff; background:linear-gradient(160deg,#3b2a6b,#c2487e) center/cover; box-shadow:0 10px 30px rgba(0,0,0,.5); display:grid; place-items:center; font-size:70px; }
  #intro .info { flex:1; display:flex; flex-direction:column; gap:8px; min-width:0; } #intro .info h3 { margin:0; font:400 34px "Bangers","Fredoka",sans-serif; letter-spacing:.05em; } #intro .info h3 small { font:500 16px "Fredoka",sans-serif; opacity:.8; margin-left:8px; }
  #intro .tags { display:flex; flex-wrap:wrap; gap:6px; } #intro .tags span { font-size:12.5px; padding:3px 10px; border-radius:999px; background:rgba(255,255,255,.16); }
  #intro .meter { display:grid; grid-template-columns:86px 1fr; gap:4px 8px; align-items:center; font-size:12.5px; } #intro .meter div { height:8px; border-radius:6px; background:rgba(255,255,255,.18); overflow:hidden; } #intro .meter div i { display:block; height:100%; border-radius:6px; background:linear-gradient(90deg,#7dd3fc,#ec4899); }
  #intro .fit { font-weight:700; color:#ffd166; } #intro .pickrow { display:flex; align-items:center; gap:14px; margin-top:4px; } #intro .pickrow span { font-weight:600; }
  #intro .yes, #intro .no { width:58px; height:58px; border-radius:50%; border:0; font-size:28px; font-weight:700; color:#fff; cursor:pointer; box-shadow:0 5px 0 rgba(0,0,0,.3); } #intro .yes { background:#2fbf71; } #intro .no { background:#e0445a; }
  #intro .flash { position:absolute; inset:0; background:#fff; opacity:0; pointer-events:none; z-index:5; } #intro.on .flash { animation:introFlash .9s ease-out forwards; } @keyframes introFlash { 0% { opacity:0; } 12% { opacity:1; } 30% { opacity:.2; } 42% { opacity:1; } 100% { opacity:1; } }
  #intro.on .pc { animation:introZoom .9s ease-in forwards; } @keyframes introZoom { to { transform:scale(2.6); } } #intro.gone { transition:opacity .6s; opacity:0; pointer-events:none; }
  @media (max-width:640px) { #intro .cards { grid-template-columns:1fr; gap:8px; } #intro .card { min-height:0; flex-direction:row; text-align:left; padding:8px 12px; gap:10px; } #intro .art { width:92px; height:70px; flex:none; } #intro .art span:nth-child(1) { font-size:46px; } #intro .art span:nth-child(2), #intro .art span:nth-child(3) { font-size:24px; } #intro .card div.txt { display:flex; flex-direction:column; gap:2px; }
    #intro .match { flex-direction:column; align-items:center; text-align:center; gap:10px; } #intro .photo { width:42%; } #intro .tags, #intro .pickrow { justify-content:center; } #intro .pc { height:min(84vh,700px); } }`;
  const el = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.filter(k => k != null)); return e; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json()).catch(() => ({}));
  const LABEL = { warmth: 'Warmth', playfulness: 'Playful', sarcasm: 'Sarcasm', confidence: 'Confidence', patience: 'Patience', nerdiness: 'Nerd level' };

  async function run({ name, snapshot, fx = () => {} }) {
    document.head.append(el('style', { textContent: css }));
    const body = el('div', { className: 'body' }), clock = el('span', { textContent: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
    const root = el('div', { id: 'intro' }, el('div', { className: 'desk' }), el('div', { className: 'pc' }, el('div', { className: 'bezel' }, el('div', { className: 'screen' }, el('div', { className: 'bar' }, el('i'), el('i'), el('i'), el('b', { textContent: 'MatchLink' }), clock), body)), el('div', { className: 'stand' }), el('div', { className: 'foot' })), el('div', { className: 'flash' }));
    document.body.append(root);
    const show = (...kids) => { body.textContent = ''; body.append(...kids); body.scrollTop = 0; };
    const click = (b) => new Promise(r => { b.onclick = () => { fx('click'); r(); }; });

    // 1. the account is made
    const go = el('button', { className: 'go', textContent: 'Find my match' });
    show(el('h2', { textContent: `Welcome, ${name}` }), el('p', { textContent: 'Your account is set up. Answer four quick questions and we will find the companion who fits you best.' }), go); await click(go);

    for (;;) {
      // 2. the questions: three picture cards each
      const answers = [];
      for (let i = 0; i < QUESTIONS.length; i++) {
        const Q = QUESTIONS[i], dots = el('div', { className: 'dots' }, ...QUESTIONS.map((_, k) => el('i', { className: k <= i ? 'on' : '' })));
        const picked = await new Promise(res => { const cards = el('div', { className: 'cards' }, ...Q.a.map((a, k) => { const c = el('button', { className: 'card' }, el('div', { className: 'art' }, ...a.art.map(x => el('span', { textContent: x }))), el('div', { className: 'txt' }, el('strong', { textContent: a.t }), el('br'), el('small', { textContent: a.d }))); c.style.background = a.bg; c.onclick = () => { fx('pop'); c.classList.add('pick'); setTimeout(() => res(k), 380); }; return c; }));
          show(dots, el('h2', { textContent: Q.q }), cards); });
        answers.push(picked);
      }
      // 3. searching
      const fill = el('div', { className: 'fill' }), status = el('p', { textContent: 'Reading your answers...' });
      show(el('div', { className: 'radar' }), el('h2', { textContent: 'Searching' }), el('div', { className: 'track' }, fill), status);
      const found = post('/api/intro', { answers }), steps = ['Reading your answers...', 'Scanning 2,318 profiles...', 'Checking temperament fit...', 'Comparing interests...', 'Rolling for initiative...', 'Almost there...'];
      for (let k = 0; k < steps.length; k++) { status.textContent = steps[k]; fill.style.transition = 'width .7s ease'; fill.style.width = Math.round((k + 1) / steps.length * 100) + '%'; fx('type'); await wait(720); }
      const m = await found, o = m.overview || { name: 'Wizra', age: 22, tags: ['goth', 'plays D&D', 'college student'], line: '', fit: 90 }, t = m.traits || {};
      // 4. match found: her picture, what she is like, yes or no
      let pic = ''; for (let k = 0; k < 10 && !pic; k++) { try { pic = await snapshot({ kind: 'selfie', pose: 'wave', scene: 'dorm', face: 'happy' }); } catch {} if (!pic) await wait(700); }
      const photo = el('div', { className: 'photo', textContent: pic ? '' : '🖤' }); if (pic) photo.style.backgroundImage = `url(${pic})`;
      const meter = el('div', { className: 'meter' }); for (const k in LABEL) { const bar = el('i'); bar.style.width = Math.max(6, Math.min(100, t[k] || 50)) + '%'; meter.append(el('span', { textContent: LABEL[k] }), el('div', {}, bar)); }
      const yes = el('button', { className: 'yes', textContent: '✓', title: 'Select this assistant' }), no = el('button', { className: 'no', textContent: '✕', title: 'Search again' });
      fx('sparkle');
      show(el('h2', { textContent: 'Match found!' }), el('div', { className: 'match' }, photo, el('div', { className: 'info' }, el('h3', {}, o.name, el('small', { textContent: o.age + ' · ' })), el('div', { className: 'tags' }, ...o.tags.map(x => el('span', { textContent: x }))), el('p', { textContent: o.line }), meter, el('div', { className: 'fit', textContent: `${o.fit}% match for you` }), el('div', { className: 'pickrow' }, el('span', { textContent: 'Select this assistant?' }), yes, no))));
      body.querySelector('.info h3 small').textContent = String(o.age);
      const ok = await new Promise(res => { yes.onclick = () => res(true); no.onclick = () => res(false); });
      if (ok) break;
      fx('click'); show(el('div', { className: 'radar' }), el('h2', { textContent: 'No problem' }), el('p', { textContent: 'Let us tune that. Answer again and we will find a better fit.' })); await wait(1500);
    }
    // 5. the screen clicks on; she starts the first conversation
    fx('click'); const first = post('/api/intro/start'); root.classList.add('on'); await wait(900); root.classList.add('gone'); setTimeout(() => root.remove(), 700);
    return (await first).text || '';
  }
  window.WizraIntro = { run };
})();
