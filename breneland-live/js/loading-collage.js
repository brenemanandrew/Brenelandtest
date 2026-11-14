// The loading screen's photo collage: the game's own screenshots, a new random arrangement on every load, packed so no background
// shows, tilted, faded a little, and never over the logo, the words or the bar (a paper plate sits behind those and photos stop
// short of it). A classic deferred script that runs after main.js and its modules have been fetched. The pictures load at low
// priority, detached (so a failed one never reaches boot-guard.js), and fade in as they arrive. When #loading hides, everything
// is removed and released. ?nocollage turns it off.
(function () {
  'use strict';
  // mount(card): the collage behind a card's words. The loading screen's at once, and the owner's menu card after a sign in
  // (public/js/tools-menu.js), when the loading card has long gone. Returns false when the collage is off.
  function mount(card) {
    if (!card || card.hidden) return false;
    var qs = location.search;
    if (/[?&]nocollage\b/.test(qs)) return false;
    try { if (navigator.connection && navigator.connection.saveData) return false; } catch (e) { /* ignore */ }

    var BASE = '/img/collage/';
    var MAX_SHOWN = 44;      // photos in one arrangement at most (the per-load budget)
    var MAX_FETCH = 60;      // pictures fetched in one load at most, re-arrangements on a turn of the phone included
    var CELL = 12;           // the coverage grid, in CSS px
    var MIX = { showcase: 0.45, build: 0.35, history: 0.2 };
    var BIG_MIX = { showcase: 0.6, history: 0.25, build: 0.15 };
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;

    var root = document.createElement('div'); root.id = 'collage'; root.setAttribute('aria-hidden', 'true');
    var photos = document.createElement('div'); photos.className = 'collage-photos';
    var wash = document.createElement('div'); wash.className = 'collage-wash';
    var plate = document.createElement('div'); plate.className = 'collage-plate';
    root.appendChild(photos); root.appendChild(wash);
    card.insertBefore(plate, card.firstChild);
    card.insertBefore(root, card.firstChild);
    card.classList.add('has-collage');
    if (still) root.classList.add('still');

    var index = null, fetched = Object.create(null), nFetched = 0, pending = [], frames = [], done = false;
    var aborter = typeof AbortController === 'function' ? new AbortController() : null;
    var calm = null, resizeTimer = 0;

    // ---------------------------------------------------------------- the calm zone: the logo, the words, the bar (and boot-guard's buttons)
    function measureCalm() {
      var r = null;
      for (var i = 0; i < card.children.length; i++) {
        var el = card.children[i];
        if (el === root || el === plate) continue;
        var b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        r = r ? { l: Math.min(r.l, b.left), t: Math.min(r.t, b.top), r: Math.max(r.r, b.right), b: Math.max(r.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
      }
      if (!r) r = { l: innerWidth / 2 - 130, t: innerHeight / 2 - 60, r: innerWidth / 2 + 130, b: innerHeight / 2 + 60 };
      var pad = 14, edge = 22; // photos stop `pad` short of the words; the plate reaches `edge` further, over the photos' edges
      calm = { l: r.l - pad, t: r.t - pad, r: r.r + pad, b: r.b + pad };
      var p = { l: calm.l - edge, t: calm.t - edge, r: calm.r + edge, b: calm.b + edge };
      plate.style.left = p.l + 'px'; plate.style.top = p.t + 'px';
      plate.style.width = (p.r - p.l) + 'px'; plate.style.height = (p.b - p.t) + 'px';
      return p;
    }

    // ---------------------------------------------------------------- picking pictures
    function pickGroup(mix) {
      var x = Math.random(), acc = 0;
      for (var g in mix) { acc += mix[g]; if (x < acc) return g; }
      return 'build';
    }
    function chooser() {
      var used = Object.create(null);
      var byGroup = { showcase: [], build: [], history: [] };
      index.forEach(function (p) { (byGroup[p.g] || byGroup.build).push(p); });
      for (var g in byGroup) shuffle(byGroup[g]);
      var reuse = shuffle(Object.keys(fetched).map(function (f) { return fetched[f].pic; }));
      return function (big) {
        // pictures already fetched this load come first (a re-arrangement after a turn), then fresh ones while the budget lasts
        for (var i = 0; i < reuse.length; i++) if (!used[reuse[i].f]) { used[reuse[i].f] = 1; return reuse[i]; }
        if (nFetched + countNew(used) < MAX_FETCH) {
          for (var tries = 0; tries < 6; tries++) {
            var list = byGroup[pickGroup(big ? BIG_MIX : MIX)];
            for (var k = 0; k < list.length; k++) if (!used[list[k].f]) { used[list[k].f] = 1; return list[k]; }
          }
          for (var g2 in byGroup) for (var k2 = 0; k2 < byGroup[g2].length; k2++) if (!used[byGroup[g2][k2].f]) { used[byGroup[g2][k2].f] = 1; return byGroup[g2][k2]; }
        }
        return reuse.length ? reuse[Math.floor(Math.random() * reuse.length)] : index[Math.floor(Math.random() * index.length)];
      };
    }
    function countNew(used) { var n = 0; for (var f in used) if (!fetched[f]) n++; return n; }
    function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

    // ---------------------------------------------------------------- the arrangement
    // A coverage grid over the screen (cells under the plate need nothing). Photos go down largest first, each centred near a
    // random uncovered cell, tilted a little. One that would reach the calm zone is pushed out of it (and straightened, so its
    // edge lines up with the zone). Repeats until every cell is under a photo. Too many photos: start again a size larger.
    function arrange(scale) {
      var W = innerWidth, H = innerHeight, S = Math.sqrt(W * H) * scale;
      var area = measureCalm();
      var cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL);
      var need = new Uint8Array(cols * rows), left = 0;
      for (var y = 0; y < rows; y++) for (var x = 0; x < cols; x++) {
        var cx = (x + 0.5) * CELL, cy = (y + 0.5) * CELL;
        var under = cx > area.l && cx < area.r && cy > area.t && cy < area.b;
        if (!under) { need[y * cols + x] = 1; left++; }
      }
      var total = left;
      var choose = chooser(), out = [];
      var classes = [[0.42, 0.5], [0.28, 0.34], [0.17, 0.22]];
      var nBig = W * H > 600000 ? 3 : 2;
      while (left > 0) {
        if (out.length >= MAX_SHOWN) return null;
        var k = out.length < nBig ? 0 : left / total > 0.3 ? 1 : 2;
        var pic = choose(k === 0);
        var L = S * (classes[k][0] + Math.random() * (classes[k][1] - classes[k][0]));
        var ar = pic.w / pic.h, w = ar >= 1 ? L : L * ar, h = ar >= 1 ? L / ar : L;
        // a random cell still showing background
        var n = Math.floor(Math.random() * left), idx = -1;
        for (var i = 0; i < need.length; i++) if (need[i] && n-- === 0) { idx = i; break; }
        var px = (idx % cols + 0.5) * CELL + (Math.random() - 0.5) * w * 0.4;
        var py = (Math.floor(idx / cols) + 0.5) * CELL + (Math.random() - 0.5) * h * 0.4;
        var rot = (Math.random() - 0.5) * 14;
        var ph = { pic: pic, x: px, y: py, w: w, h: h, rot: rot };
        if (push(ph)) { ph.rot = (Math.random() - 0.5) * 2; push(ph); }
        var got = cover(ph, need, cols, rows);
        if (!got) { // pushed off its cell by the calm zone: straighten it and put it against the zone on the side of the cell
          var ox = (idx % cols + 0.5) * CELL, oy = (Math.floor(idx / cols) + 0.5) * CELL;
          for (var side = 0; side < 4 && !got; side++) { ph.x = ox; ph.y = oy; ph.rot = 0; push(ph, side); got = cover(ph, need, cols, rows); }
          if (!got) { need[idx] = 0; left--; continue; } // can't happen outside the plate, kept so the loop always ends
        }
        left -= got;
        out.push(ph);
      }
      // random stacking, then leave out any photo hidden under the ones above it (every cell it holds is held by one above):
      // it would be fetched for nothing, and the background stays covered without it
      shuffle(out);
      var shown = [];
      for (var a = 0; a < out.length; a++) {
        var o = out[a], R = Math.hypot(o.w, o.h) / 2, hidden = true;
        var x0 = Math.max(0, Math.floor((o.x - R) / CELL)), x1 = Math.min(cols - 1, Math.floor((o.x + R) / CELL));
        var y0 = Math.max(0, Math.floor((o.y - R) / CELL)), y1 = Math.min(rows - 1, Math.floor((o.y + R) / CELL));
        for (var yy = y0; yy <= y1 && hidden; yy++) for (var xx = x0; xx <= x1 && hidden; xx++) {
          var X = (xx + 0.5) * CELL, Y = (yy + 0.5) * CELL;
          if (!inside(o, X, Y, -CELL * 0.71)) continue; // not a cell this photo touches
          var held = false;
          for (var b2 = a + 1; b2 < out.length && !held; b2++) held = inside(out[b2], X, Y, CELL * 0.71);
          if (!held) hidden = false;
        }
        if (!hidden) shown.push(o);
      }
      return shown;
    }

    // the photo's corners pushed clear of the calm zone, the shortest way or to a given side (true if it had to move)
    function push(ph, side) {
      var c = Math.abs(Math.cos(ph.rot * Math.PI / 180)), s = Math.abs(Math.sin(ph.rot * Math.PI / 180));
      var hw = (ph.w * c + ph.h * s) / 2, hh = (ph.w * s + ph.h * c) / 2;
      var l = ph.x - hw, r = ph.x + hw, t = ph.y - hh, b = ph.y + hh;
      if (r <= calm.l || l >= calm.r || b <= calm.t || t >= calm.b) return false;
      var moves = [[calm.l - r, 0], [calm.r - l, 0], [0, calm.t - b], [0, calm.b - t]];
      var m = side !== undefined ? moves[side] : moves.slice().sort(function (u, v) { return Math.abs(u[0] + u[1]) - Math.abs(v[0] + v[1]); })[0];
      ph.x += m[0]; ph.y += m[1];
      return true;
    }
    function inside(ph, X, Y, inset) {
      var c = Math.cos(-ph.rot * Math.PI / 180), s = Math.sin(-ph.rot * Math.PI / 180);
      var dx = X - ph.x, dy = Y - ph.y, lx = dx * c - dy * s, ly = dx * s + dy * c;
      return Math.abs(lx) <= ph.w / 2 - inset && Math.abs(ly) <= ph.h / 2 - inset;
    }
    // mark the cells wholly under the photo; returns how many still needed covering
    function cover(ph, need, cols, rows) {
      var R = Math.hypot(ph.w, ph.h) / 2, inset = CELL * 0.71, got = 0;
      var x0 = Math.max(0, Math.floor((ph.x - R) / CELL)), x1 = Math.min(cols - 1, Math.floor((ph.x + R) / CELL));
      var y0 = Math.max(0, Math.floor((ph.y - R) / CELL)), y1 = Math.min(rows - 1, Math.floor((ph.y + R) / CELL));
      for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
        var i = y * cols + x;
        if (need[i] && inside(ph, (x + 0.5) * CELL, (y + 0.5) * CELL, inset)) { need[i] = 0; got++; }
      }
      return got;
    }

    // ---------------------------------------------------------------- drawing and loading
    function draw(list) {
      frames.forEach(function (f) { f.el.remove(); });
      frames = [];
      var z = 1;
      list.forEach(function (ph) {
        var el = document.createElement('div');
        el.className = 'cphoto';
        var bw = Math.max(3, Math.min(9, Math.round(Math.min(ph.w, ph.h) * 0.035)));
        el.style.cssText = 'left:' + (ph.x - ph.w / 2).toFixed(1) + 'px;top:' + (ph.y - ph.h / 2).toFixed(1) + 'px;width:' + ph.w.toFixed(1) + 'px;height:' + ph.h.toFixed(1) +
          'px;border-width:' + bw + 'px;transform:rotate(' + ph.rot.toFixed(2) + 'deg);z-index:' + (z++);
        el.dataset.g = ph.pic.g;
        photos.appendChild(el);
        var f = { el: el, pic: ph.pic };
        frames.push(f);
        load(ph.pic, function (img) { if (done || !el.isConnected) return; el.appendChild(img.parentNode ? img.cloneNode() : img); el.classList.add('in'); });
      });
    }
    function load(pic, cb) {
      var have = fetched[pic.f];
      if (have) { if (have.img.complete && have.ok) cb(have.img); else have.wait.push(cb); return; }
      var img = new Image(); // detached until it has loaded: a failed picture fires no error a boot-guard listener could see
      try { img.fetchPriority = 'low'; } catch (e) { /* older browsers */ }
      img.decoding = 'async';
      img.alt = '';
      var rec = fetched[pic.f] = { img: img, pic: pic, ok: false, wait: [cb] };
      nFetched++;
      pending.push(img);
      img.onload = function () { rec.ok = true; var w = rec.wait; rec.wait = []; w.forEach(function (fn) { fn(img); }); };
      img.onerror = function () { rec.wait = []; };
      img.src = BASE + pic.f;
    }

    function layout() {
      if (done || !index || !index.length) return;
      var list = null;
      for (var s = 1, i = 0; i < 5 && !list; i++, s *= 1.12) list = arrange(s);
      if (list) draw(list);
    }
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(layout, 250);
    }

    // ---------------------------------------------------------------- the end: the loading card hides, the collage goes with it
    function finish() {
      if (done) return;
      done = true;
      removeEventListener('resize', onResize);
      clearTimeout(resizeTimer);
      obs.disconnect();
      if (aborter) try { aborter.abort(); } catch (e) { /* ignore */ }
      pending.forEach(function (img) { img.onload = img.onerror = null; img.removeAttribute('src'); }); // stops what is still in flight
      pending = []; frames = []; fetched = Object.create(null); index = null;
      root.remove(); plate.remove();
      card.classList.remove('has-collage');
      window.__collage = { done: true, fetched: nFetched };
    }
    var obs = new MutationObserver(function (muts) {
      if (card.hidden) return finish();
      for (var i = 0; i < muts.length; i++) if (muts[i].type === 'childList') { measureCalm(); break; } // boot-guard's buttons: the plate grows
    });
    obs.observe(card, { attributes: true, attributeFilter: ['hidden'], childList: true });

    // test hook (tools/loading-collage-test.mjs)
    window.__collage = {
      get frames() { return frames.map(function (f) { return f.el; }); },
      get fetched() { return nFetched; },
      get loaded() { var n = 0; for (var f in fetched) if (fetched[f].ok) n++; return n; },
      get calm() { return calm; },
      maxShown: MAX_SHOWN, maxFetch: MAX_FETCH,
      relayout: layout,
    };

    addEventListener('resize', onResize);
    var fontsReady = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise(function (r) { setTimeout(r, 900); })]) : Promise.resolve();
    fetch(BASE + 'index.json', aborter ? { signal: aborter.signal, priority: 'low' } : {})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return fontsReady.then(function () { return j; }); })
      .then(function (j) { if (done || !j || !j.pictures) return; index = j.pictures; layout(); })
      .catch(function () { /* no collage, the plain card stays */ });
    return true;
  }
  window.brenelandCollage = { mount: mount };
  mount(document.getElementById('loading'));
})();
