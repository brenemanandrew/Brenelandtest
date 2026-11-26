// Install for a fast start: download the game's files to this device in one go, with a progress bar, small or large.
//   small: the game, all her moves, and the outfit she is wearing now
//   large: that, plus every outfit she can wear at her level, her beach outfits, the beach and village pieces, and hand tracking
// The files go into the browser's (or the Brenai app's) storage, where sw.js serves them from. Asked once the first time the Android
// app opens; any time from the menu (📦). WizraInstall.open() shows it; WizraInstall.status() says what is installed.
(function () {
  const ASSETS = 'brenai-assets-v1', CODE = 'brenai-code-v1', KEY = 'brenai.install';
  const isCode = url => { const u = new URL(url, location.href); return u.origin === location.origin && (u.pathname === '/' || /\.(js|mjs|css|html)$/.test(u.pathname)); };
  const mb = n => (n / 1048576).toFixed(n > 104857600 ? 0 : 1) + ' MB';
  let box = null, busy = false, stop = false;
  function el(tag, props, ...kids) { const e = document.createElement(tag); Object.assign(e, props || {}); for (const k of kids) e.append(k); return e; }
  function css() { if (document.getElementById('instCss')) return; const s = el('style', { id: 'instCss', textContent: `
    #instBox { position:fixed; inset:0; z-index:95; display:flex; align-items:center; justify-content:center; background:rgba(20,10,35,.86); padding:16px; }
    #instBox .p { width:min(520px, 100%); background:#fff; border-radius:22px; padding:20px; box-shadow:0 12px 40px rgba(0,0,0,.5); font:500 15px Fredoka, sans-serif; color:#2a1840; }
    #instBox h2 { margin:0 0 4px; font:400 28px Bangers, Fredoka, sans-serif; letter-spacing:1px; color:#6b21a8; } #instBox .sub { margin:0 0 14px; color:#6b5a80; font-size:14px; }
    #instBox .opts { display:grid; grid-template-columns:1fr 1fr; gap:10px; } #instBox .o { border:2px solid #e9d5ff; border-radius:16px; padding:12px; text-align:left; background:#faf5ff; cursor:pointer; font:inherit; color:inherit; }
    #instBox .o b { display:block; font-size:18px; color:#7e22ce; } #instBox .o i { display:block; font-style:normal; font-weight:700; color:#db2777; margin:2px 0 6px; } #instBox .o small { color:#6b5a80; font-size:12.5px; line-height:1.35; }
    #instBox .o:hover { border-color:#c084fc; } #instBox .bar { height:16px; border-radius:999px; background:#f3e8ff; overflow:hidden; margin:14px 0 6px; } #instBox .bar div { height:100%; width:0; background:linear-gradient(90deg,#f472b6,#a855f7); transition:width .2s; }
    #instBox .st { min-height:1.3em; font-size:13px; color:#6b5a80; } #instBox .row { display:flex; justify-content:flex-end; gap:8px; margin-top:12px; } #instBox .row button { border:0; border-radius:999px; padding:9px 18px; font:600 14px Fredoka, sans-serif; background:#f3e8ff; color:#6b21a8; }
  ` }); document.head.append(s); }
  async function list(size) { const r = await fetch('/api/assets?size=' + size); if (!r.ok) throw new Error('the list did not come (' + r.status + ')'); return r.json(); }
  async function run(size, bar, st) {
    busy = true; stop = false; try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch {}
    const man = await list(size), files = man.files, total = files.reduce((a, f) => a + (f.size || 400000), 0); let done = 0, got = 0, fails = 0;
    const show = (t) => { bar.style.width = Math.min(100, 100 * done / total).toFixed(1) + '%'; st.textContent = t || `${mb(done)} of about ${mb(total)} (${got} of ${files.length} files)`; };
    const [ac, cc] = await Promise.all([caches.open(ASSETS), caches.open(CODE)]); let i = 0;
    async function one(f) { const cache = isCode(f.url) ? cc : ac, want = f.size || 400000;
      try { if (await cache.match(f.url, { ignoreVary: true })) { done += want; got++; show(); return; }   /* already kept */
        const r = await fetch(f.url, { credentials: 'include', mode: new URL(f.url, location.href).origin === location.origin ? 'same-origin' : 'cors' }); if (!r.ok) throw new Error(r.status);
        const keep = cache.put(f.url, r.clone()); const rd = r.body.getReader(); let seen = 0; for (;;) { const { done: end, value } = await rd.read(); if (end) break; seen += value.length; done += value.length; if (seen > want) done -= value.length; show(); if (stop) { try { rd.cancel(); } catch {} throw new Error('stopped'); } }
        await keep; if (seen < want) done += want - seen; got++; show(); }
      catch (e) { if (stop) throw e; fails++; done += want; show(); } }
    const lane = async () => { while (i < files.length && !stop) await one(files[i++]); };
    try { await Promise.all([lane(), lane(), lane()]); } finally { busy = false; }
    if (stop) { show('Stopped. What was downloaded is kept.'); return false; }
    localStorage.setItem(KEY, JSON.stringify({ size, at: Date.now(), files: files.length, bytes: total, fails }));
    bar.style.width = '100%'; st.textContent = fails ? `Done, ${fails} file(s) could not be fetched (they will download when needed).` : `Done: ${mb(total)} kept on this device. She will start much faster.`; return true;
  }
  async function open(first) {
    if (box) return; css(); let sizes = null; try { const [a, b] = await Promise.all([list('small'), list('large')]); sizes = { small: a.bytes, large: b.bytes }; } catch {}
    const was = status(), bar = el('div'), st = el('div', { className: 'st' }), close = el('button', { textContent: first ? 'Not now' : 'Close' });
    const opt = (k, title, what) => { const b = el('button', { className: 'o' }, el('b', { textContent: title }), el('i', { textContent: sizes ? 'about ' + mb(sizes[k]) : '' }), el('small', { textContent: what })); b.onclick = async () => { if (busy) return; for (const x of opts.children) x.disabled = true; close.textContent = 'Stop'; try { await run(k, bar, st); } catch (e) { st.textContent = 'Could not finish: ' + e.message; } close.textContent = 'Close'; for (const x of opts.children) x.disabled = false; }; return b; };
    const opts = el('div', { className: 'opts' }, opt('small', 'Small', 'The game, all her moves, and the outfit she is wearing now.'), opt('large', 'Large', 'Also every outfit she can wear now, her beach outfits, the beach and village pieces, and hand tracking.'));
    box = el('div', { id: 'instBox' }, el('div', { className: 'p' }, el('h2', { textContent: 'Make Brenai start faster' }), el('p', { className: 'sub', textContent: (was ? 'Installed: ' + was.size + ' (' + mb(was.bytes) + '). Run it again to update. ' : '') + 'Download her once and keep her on this device. You can change this any time from the menu (📦).' }), opts, el('div', { className: 'bar' }, bar), st, el('div', { className: 'row' }, close)));
    close.onclick = () => { if (busy) { stop = true; return; } box.remove(); box = null; if (first && !status()) localStorage.setItem(KEY + '.asked', '1'); };
    document.body.append(box); }
  function status() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  window.WizraInstall = { open, status };
  /* the service worker, and the first-run offer inside the Android app (once she is signed in and on screen) */
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  if (/BrenaiApp/.test(navigator.userAgent) && !status() && !localStorage.getItem(KEY + '.asked')) { const t = setInterval(() => { try { if (window.avatar && avatar.canVisit && avatar.canVisit()) { clearInterval(t); setTimeout(() => open(true), 1500); } } catch {} }, 2000); }
})();
