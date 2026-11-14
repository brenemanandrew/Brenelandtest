// Loading-screen safety net (a classic script, loaded before the modules so it also sees a module that fails to load).
// While the loading card is up: an error or a rejected promise shows a short message with Reload buttons and is reported
// to the server log (POST /api/client-error, a few per page at most); if loading takes longer than 60 s the same buttons
// appear. Once the loading card hides, this does nothing. Text goes in with textContent only.
(function () {
  var started = Date.now(), reports = 0, shown = false;
  function card() { return document.getElementById('loading'); }
  function loading() { var c = card(); return !!c && !c.hidden; }
  function stage() { var t = document.getElementById('loading-text'); return t ? t.textContent.slice(0, 80) : ''; }
  function quality() { try { return localStorage.getItem('breneland.quality') || ''; } catch (e) { return ''; } }
  // a timeline of the loading stages ([seconds, text]) so a report says where a device got to
  var timeline = [[0, stage()]];
  try {
    new MutationObserver(function () { var t = stage(); if (t !== timeline[timeline.length - 1][1] && timeline.length < 80) { timeline.push([Math.round((Date.now() - started) / 10) / 100, t]); if (typeof save === 'function') save(false); } })
      .observe(document.getElementById('loading-text'), { childList: true, characterData: true, subtree: true });
  } catch (e) {}
  function gl() {
    try { var c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'); if (!g) return 'none';
      var d = g.getExtension('WEBGL_debug_renderer_info'); return (d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER)) + ''; } catch (e) { return 'err'; }
  }

  function report(kind, msg, stack, prev) {
    if (reports >= 4) return;
    reports++;
    var body = JSON.stringify({ kind: kind, msg: String(msg || '').slice(0, 300), stack: String(stack || '').slice(0, 900),
      stage: prev ? prev.stage : stage(), secs: prev ? prev.secs : Math.round((Date.now() - started) / 1000), q: prev ? prev.q : quality(),
      ua: navigator.userAgent.slice(0, 200), w: innerWidth, h: innerHeight, dpr: devicePixelRatio, gl: gl().slice(0, 80),
      timeline: prev ? prev.timeline : timeline, hidden: !!document.hidden });
    // sendBeacon survives the page closing (the "gave up" report); fetch keepalive otherwise
    try { if (kind === 'left' && navigator.sendBeacon && navigator.sendBeacon('/api/client-error', new Blob([body], { type: 'application/json' }))) return; } catch (e) {}
    try { fetch('/api/client-error', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }

  function button(text, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn boot-guard-btn'; b.textContent = text;
    b.style.cssText = 'margin:10px 6px 0;font:700 15px var(--font-head, sans-serif);padding:8px 14px;border-radius:12px;border:3px solid #2b2340;background:#fff;cursor:pointer';
    b.addEventListener('click', onClick);
    return b;
  }

  function show(message) {
    if (shown || !loading()) return;
    shown = true;
    var c = card(), t = document.getElementById('loading-text');
    if (t) t.textContent = message;
    var row = document.createElement('div');
    row.className = 'boot-guard';
    row.appendChild(button('Reload', function () { location.reload(); }));
    row.appendChild(button('Reload with Fast graphics', function () {
      try { localStorage.setItem('breneland.quality', JSON.stringify('low')); localStorage.setItem('breneland.gfxMode', JSON.stringify('manual')); } catch (e) {} // (a choice: auto graphics leaves it alone)
      location.reload();
    }));
    c.appendChild(row);
  }

  window.addEventListener('error', function (e) {
    if (!loading()) return;
    var el = e.target, what;
    if (el && el !== window && (el.src || el.href)) what = 'could not load ' + (el.src || el.href);       // a script or file that failed
    else what = (e.message || 'error') + (e.filename ? ' (' + e.filename.split('/').pop() + ':' + e.lineno + ')' : '');
    report('error', what, e.error && e.error.stack);
    show('Something went wrong while loading. Try Reload.');
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    if (!loading()) return;
    var r = e.reason || {};
    report('rejection', r.message || String(r), r.stack);
    show('Something went wrong while loading. Try Reload.');
  });

  setTimeout(function () {
    if (!loading()) return;
    report('slow', 'still loading after 60 s', '');
    show('This is taking a while. Reload, or try Fast graphics.');
  }, 60000);
  // The crash log: the loading record is kept in localStorage as it goes. If a device dies mid-load (the whole browser or
  // phone goes down, so no report can leave), the NEXT load finds the unfinished record and reports where it got to.
  var KEY = 'breneland.bootlog';
  function save(done, why) {
    if (left && !done) return; // the page is closing: a late timer must not overwrite the "closed" mark (a false crash next load)
    try { localStorage.setItem(KEY, JSON.stringify({ done: !!done, why: why || '', stage: stage(), secs: Math.round((Date.now() - started) / 1000), q: quality(), timeline: timeline, at: started })); } catch (e) {}
  }
  try {
    var prev = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (prev && !prev.done && prev.timeline) report('crash', 'the previous load died after ' + prev.secs + ' s at "' + prev.stage + '"', '', prev);
  } catch (e) {}
  save(false);
  // Step pings: a tiny beacon at the start, at every loading step and at the end, with a per-load id. The server reports any
  // load that goes quiet before its end, so even a device that dies outright (no page event fires) leaves a trace.
  var loadId = Math.random().toString(36).slice(2, 10), lastPinged = stage(), finished;
  function ping(kind, extra) {
    var o = { id: loadId, kind: kind, stage: stage(), secs: Math.round((Date.now() - started) / 10) / 100 };
    if (extra) for (var k in extra) o[k] = extra[k];
    var body = JSON.stringify(o);
    // a plain fetch goes out at once (a queued beacon can die with the browser); the beacon only when the page is unloading
    if (kind === 'left') { try { if (navigator.sendBeacon && navigator.sendBeacon('/api/client-step', new Blob([body], { type: 'application/json' }))) return; } catch (e) {} }
    try { fetch('/api/client-step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  ping('start', { ua: navigator.userAgent.slice(0, 200), q: quality(), dpr: devicePixelRatio, w: innerWidth, h: innerHeight, gl: gl().slice(0, 80) });
  // a loading step the game can set from synchronous code (every character build calls it): the text changes and the ping
  // leaves right away, before the build runs, so a device that dies inside the build still names it
  window.__loadStep = function (text) {
    if (!loading()) return;
    try { var t = document.getElementById('loading-text'); if (t) t.textContent = text; } catch (e) {}
    if (timeline.length < 80) timeline.push([Math.round((Date.now() - started) / 10) / 100, text]);
    save(false); lastPinged = text; ping('step');
  };
  finished = false;
  function finish() { if (finished) return; finished = true; save(true, 'loaded'); ping('done'); clearInterval(keep); }
  var keep = setInterval(function () {
    var t = stage();
    if (t !== lastPinged) { lastPinged = t; ping('step'); }
    if (loading()) save(false); else finish();
  }, 250);
  try { new MutationObserver(function () { if (!loading()) finish(); }).observe(card(), { attributes: true, attributeFilter: ['hidden'] }); } catch (e) {} // the instant the card hides
  // still loading after 20 s: say so (a slow phone usually gives up before 60 s)
  setTimeout(function () { if (loading()) report('slow', 'still loading after 20 s', ''); }, 20000);
  // the page is closed, reloaded or sent to the background while still loading: report where it got to
  var left = false;
  function gaveUp(why) { if (left || !loading()) return; left = true; save(true, why); ping('left'); report('left', why + ' while loading', ''); }
  window.addEventListener('pagehide', function () { gaveUp('page hidden/closed'); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) gaveUp('tab went to the background'); });
})();
