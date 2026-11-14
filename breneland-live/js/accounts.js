// Accounts on the start screen: type your name, press Step outside, then pick a 4-digit PIN (a new name) or enter it (one you
// already have). "Just visiting" comes in as a guest and nothing is saved. Server side: lib/accounts.js.
// localStorage breneland.account = { name, token }. The token skips the PIN when you come back from one of Andrew's games within
// the 3-hour welcome-back window. A fresh visit shows your name and asks for the PIN.
import { el, loadCss } from './util.js';

const $ = s => document.querySelector(s);
const BACKSPACE = String.fromCharCode(0x232b);
const clean = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 20);
const keyOf = s => clean(s).normalize('NFKC').toLowerCase();
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const randomHex = n => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');

async function post(path, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-breneland-token'] = token;
  try {
    const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body || {}), cache: 'no-store' });
    let j = {};
    try { j = await r.json(); } catch { /* empty */ }
    return { code: r.status, ...j };
  } catch { return { code: 0, error: 'offline' }; }
}

// opts: { store, profile, input, ui, enter(editing), refresh(), remount(), fresh() -> a new random profile }
export function createAccounts(opts) {
  const { store, profile, input, ui } = opts;
  loadCss('/css/accounts.css');
  let remembered = store.get('account', null);
  if (!remembered || typeof remembered.name !== 'string') remembered = null;
  const auth = { mode: 'none', name: '', token: '', owner: false };   // mode: none | account | guest. owner: the server says this is Andrew's account
  let resumed = false, editing = false, view = 'name', who = '', first = '', busy = false, built = false;
  const ui$ = {};

  // ---------------------------------------------------------------- DOM (built once, into the start panel)

  function build() {
    if (built) return;
    built = true;
    const panel = $('#start .start-panel');
    const field = panel.querySelector('.field');
    // under the name box: a message line and "Not you?"
    ui$.row = el('div', 'acct-row');
    ui$.note = el('p', 'acct-note', '', { 'aria-live': 'polite' });
    ui$.switch = el('button', 'acct-link acct-switch', 'Not you?', { type: 'button' });
    ui$.switch.onclick = () => notYou();
    ui$.row.append(ui$.note, ui$.switch);
    field.after(ui$.row);

    // the PIN step
    const v = ui$.view = el('section', 'acct-view', '', { 'aria-label': 'Your PIN' });
    v.hidden = true;
    ui$.step = el('div', 'acct-step');
    ui$.title = el('h2', 'acct-title');
    ui$.sub = el('p', 'acct-sub');
    const boxes = ui$.boxes = el('div', 'pin-boxes');
    ui$.box = [0, 1, 2, 3].map(() => { const b = el('span', 'pin-box'); boxes.append(b); return b; });
    const pin = ui$.pin = el('input', 'pin-input', '', {
      type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'off', autocapitalize: 'off',
      spellcheck: 'false', 'aria-label': '4-digit PIN', name: 'breneland-pin',
    });
    boxes.append(pin);
    pin.addEventListener('input', () => { setPin(pin.value); });
    pin.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); back(); }
    });
    boxes.addEventListener('pointerdown', () => { if (!coarse()) setTimeout(() => pin.focus(), 0); });
    ui$.msg = el('p', 'acct-msg', '', { role: 'status' });
    const pad = ui$.pad = el('div', 'pin-pad', '', { role: 'group', 'aria-label': 'Number keys' });
    const key = (label, fn, cls = '', aria = '') => {
      const b = el('button', 'pin-key ' + cls, label, { type: 'button', ...(aria ? { 'aria-label': aria } : {}) });
      b.addEventListener('click', () => { fn(); if (input.lastDevice !== 'pad' && !coarse()) pin.focus({ preventScroll: true }); });
      pad.append(b);
      return b;
    };
    for (const d of '123456789') key(d, () => setPin(pin.value + d));
    key(BACKSPACE, () => setPin(pin.value.slice(0, -1)), 'pin-fn', 'Delete');
    key('0', () => setPin(pin.value + '0'));
    key('Clear', () => setPin(''), 'pin-fn pin-clear', 'Clear');
    // the guest step: one button
    ui$.guestGo = el('button', 'btn primary acct-guest-go', 'Step outside as a guest', { type: 'button' });
    ui$.guestGo.onclick = () => enterGuest();
    ui$.links = el('div', 'acct-links');
    ui$.back = el('button', 'acct-link', 'Back', { type: 'button' });
    ui$.back.onclick = () => back();
    ui$.notYou = el('button', 'acct-link', 'Not you?', { type: 'button' });
    ui$.notYou.onclick = () => notYou();
    ui$.forgot = el('p', 'acct-forgot', 'Forgot your PIN? Andrew can reset it for you.');
    ui$.links.append(ui$.back, ui$.notYou);
    v.append(ui$.step, ui$.title, ui$.sub, boxes, ui$.msg, pad, ui$.guestGo, ui$.links, ui$.forgot);
    // keys typed anywhere in the step (e.g. while a pad key has the focus)
    v.addEventListener('keydown', e => {
      if (e.target === pin || view === 'guest') { if (e.key === 'Escape') back(); return; }
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); setPin(pin.value + e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); setPin(pin.value.slice(0, -1)); }
      else if (e.key === 'Escape') { e.preventDefault(); back(); }
    });
    v.addEventListener('paste', e => { const t = e.clipboardData?.getData('text') || ''; if (e.target !== pin && t) { e.preventDefault(); setPin(pin.value + t); } });
    $('#avatar-editor').after(v);

    // under Step outside: come in as a guest
    ui$.guest = el('button', 'acct-link acct-guest', 'Just visiting? Come in as a guest', { type: 'button' });
    ui$.guest.onclick = () => guestAsk();
    $('#go').after(ui$.guest);
  }

  // ---------------------------------------------------------------- PIN box

  function setPin(raw) {
    if (busy) return;
    const digits = String(raw).replace(/[^0-9]/g, '').slice(0, 4);
    ui$.pin.value = digits;
    ui$.box.forEach((b, i) => { b.classList.toggle('on', i < digits.length); b.classList.toggle('next', i === digits.length); });
    if (digits.length) ui$.msg.textContent = '';
    ui$.boxes.classList.remove('bad', 'good');
    if (digits.length === 4) setTimeout(submit, 90); // a beat so the fourth dot shows
  }
  function shake(text) {
    ui$.msg.textContent = text;
    ui$.msg.classList.add('err');
    const b = ui$.boxes;
    b.classList.remove('shake'); void b.offsetWidth;
    b.classList.add('bad');
    if (!calm()) b.classList.add('shake');
    setTimeout(() => { b.classList.remove('shake'); }, 500);
    busy = false; setPin('');
    ui$.boxes.classList.add('bad');
  }
  function say(text, err = false) { ui$.msg.textContent = text; ui$.msg.classList.toggle('err', err); }
  function focusStep() {
    const f = () => {
      if (view === 'guest') { ui$.guestGo.focus(); return; }
      if (input.lastDevice === 'pad') ui$.pad.querySelector('.pin-key')?.focus();
      else if (!coarse()) ui$.pin.focus({ preventScroll: true });
    };
    f(); setTimeout(f, 40); // now (so fast typists lose nothing) and once more after the panel has settled
  }

  // ---------------------------------------------------------------- views

  const PIN_VIEWS = { setup1: 1, setup2: 1, reset1: 1, reset2: 1, login: 1 };
  function show(v, msg = '') {
    build();
    view = v;
    const pinStep = !!PIN_VIEWS[v], step = pinStep || v === 'guest';
    const startEl = $('#start');
    startEl.classList.toggle('acct-pin', step);
    $('#start .start-panel').classList.toggle('acct-on', step);
    for (const q of ['#start .start-panel > .field', '#avatar-editor', '#go']) { const e = $(q); if (e) e.hidden = step; }
    ui$.row.hidden = step; ui$.guest.hidden = step || editing || auth.mode === 'account';
    ui$.view.hidden = !step;
    ui$.boxes.hidden = ui$.pad.hidden = !pinStep;
    ui$.guestGo.hidden = v !== 'guest';
    ui$.forgot.hidden = v !== 'login';
    const mine = v === 'login' && !!remembered && keyOf(remembered.name) === keyOf(who); // this device knows you: "Not you?" instead of Back
    ui$.notYou.hidden = !mine;
    ui$.back.hidden = mine;
    ui$.msg.classList.remove('err');
    ui$.msg.textContent = msg;
    const T = {
      setup1: ['Step 1 of 2', `Nice to meet you, ${who}!`, "Pick a 4-digit PIN. You'll use it to log in next time."],
      setup2: ['Step 2 of 2', 'One more time', "Type the same 4 digits again to be sure."],
      reset1: ['New PIN', `Hi again, ${who}!`, 'Your PIN was reset. Pick a new 4-digit PIN.'],
      reset2: ['New PIN', 'One more time', "Type the same 4 digits again to be sure."],
      login: ['', `Welcome back, ${who}.`, 'Enter your PIN.'],
      guest: ['Guest pass', `Just visiting, ${who}?`, "Come on in! As a guest nothing is saved: no fish count, biscuits or swing records. Pick a PIN next time to keep them."],
    }[v];
    if (T) { ui$.step.textContent = T[0]; ui$.step.hidden = !T[0]; ui$.title.textContent = T[1]; ui$.sub.textContent = T[2]; }
    if (pinStep) { busy = false; setPin(''); focusStep(); }
    else if (step) focusStep();
    else {
      ui$.note.textContent = msg;
      ui$.note.classList.toggle('err', !!msg);
      syncNameView();
    }
  }
  function syncNameView() {
    const signedIn = auth.mode === 'account';
    ui$.switch.hidden = !(signedIn && resumed && !editing);
    if (!ui$.note.textContent) {
      if (signedIn && (resumed || editing)) ui$.note.textContent = `Logged in as ${auth.name}.`;
      else if (auth.mode === 'guest' && editing) ui$.note.textContent = 'Visiting as a guest: nothing is saved.';
    }
    ui$.row.hidden = !ui$.note.textContent && ui$.switch.hidden;
  }
  function nameError(text) { show('name', text); $('#name-input').focus(); }

  function back() {
    if (busy) return;
    const n = $('#name-input');
    if (n && who) n.value = who;
    show('name');
    setTimeout(() => $('#name-input')?.focus(), 30);
  }

  // ---------------------------------------------------------------- flows

  function applyServerProfile(res) {
    const p = res.profile || {};
    profile.id = res.id;
    profile.name = res.name;
    for (const k of ['color', 'hat', 'skin', 'voice']) if (p[k] !== undefined) profile[k] = p[k];
    if (p.look && typeof p.look === 'object') profile.look = { ...p.look };
    const n = $('#name-input'); if (n) n.value = res.name;
  }
  function signedIn(res) {
    applyServerProfile(res);
    auth.mode = 'account'; auth.name = res.name; auth.owner = res.owner === true;
    if (res.token) auth.token = res.token;
    remembered = { name: res.name, token: auth.token };
    store.set('account', remembered);
    store.set('profile', profile);
    opts.refresh();
  }
  // a little moment of "yes!" before the door opens
  function celebrate(then) {
    ui$.boxes.classList.add('good');
    say(view === 'login' ? 'That\'s it!' : 'All set!', false);
    setTimeout(then, calm() ? 150 : 420);
  }

  async function submit() {
    if (busy || !PIN_VIEWS[view]) return;
    const pinV = ui$.pin.value;
    if (!/^[0-9]{4}$/.test(pinV)) { if (!pinV) say('Type your 4 digits.'); return; }
    if (view === 'setup1' || view === 'reset1') { first = pinV; show(view === 'setup1' ? 'setup2' : 'reset2'); return; }
    if ((view === 'setup2' || view === 'reset2') && pinV !== first) {
      const again = view === 'setup2' ? 'setup1' : 'reset1';
      show(again); shake("Those didn't match. Pick your PIN again."); return;
    }
    busy = true;
    say('Checking...');
    let res;
    if (view === 'login') res = await post('/api/account/login', { name: who, pin: pinV, prev: remembered?.token || '' });
    else if (view === 'reset2') res = await post('/api/account/newpin', { name: who, pin: pinV });
    else res = await post('/api/account/register', { name: who, pin: pinV, id: profile.id, profile: { name: who, color: profile.color, hat: profile.hat, skin: profile.skin, voice: profile.voice, look: profile.look || {} } });
    busy = false;
    if (res.code === 200 && res.token) {
      signedIn(res);
      busy = true;
      celebrate(() => { busy = false; opts.enter(false); });
      return;
    }
    if (res.code === 401) return shake(res.message || "That's not it. Try again.");
    if (res.code === 429) return shake(res.message || 'Too many tries. Wait a few minutes.');
    if (res.code === 409 && res.error === 'reset') return show('reset1');
    if (res.code === 409 && res.error === 'taken') return show('login', 'Someone already has that name. If it is you, enter your PIN.');
    if (res.code === 404) return show('setup1', 'Nobody has that name yet. Pick a PIN to make it yours.');
    if (res.code === 0) return shake("Can't reach Breneland right now. Try again in a moment.");
    if (res.code === 400 && view !== 'login') return nameError(res.message || 'Try another name.');
    shake(res.message || 'Something went wrong. Try again.');
  }

  async function checkName(name) {
    const r = await post('/api/account/check', { name });
    if (r.code === 0) return { state: 'offline' };
    return r;
  }

  // Step outside / Back to the yard / Back outside
  async function go(isEditing) {
    editing = !!isEditing;
    if (PIN_VIEWS[view]) return submit(); // the pad's Start button presses #go
    if (view === 'guest') return enterGuest();
    if (busy) return;
    const nameIn = $('#name-input');
    const name = clean(nameIn.value);
    if (!name) { nameIn.focus(); nameIn.placeholder = 'Pick a name first!'; return; }
    busy = true;
    try {
      if (auth.mode === 'account' && (editing || resumed)) {
        if (name !== auth.name) {
          const r = await post('/api/account/rename', { name }, auth.token);
          if (r.code !== 200) return nameError(r.message || (r.code === 0 ? "Can't reach Breneland right now." : 'Try another name.'));
          auth.name = r.name; remembered = { name: r.name, token: auth.token }; store.set('account', remembered);
          nameIn.value = r.name;
        }
        return opts.enter(editing);
      }
      if (auth.mode === 'guest' && editing) {
        if (keyOf(name) !== keyOf(profile.name)) {
          const r = await checkName(name);
          if (r.state === 'known' || r.state === 'reset') return nameError('That name belongs to someone with a PIN. Pick another one.');
        }
        return opts.enter(true);
      }
      const r = await checkName(name);
      who = r.name || name;
      if (r.state === 'new') return show('setup1');
      if (r.state === 'known') return show('login');
      if (r.state === 'reset') return show('reset1');
      if (r.state === 'offline') return nameError("Can't reach Breneland right now. Try again, or come in as a guest.");
      return nameError(r.message || 'Try another name.');
    } finally { busy = false; }
  }

  async function guestAsk() {
    if (busy) return;
    const nameIn = $('#name-input');
    const name = clean(nameIn.value);
    if (!name) { nameIn.focus(); nameIn.placeholder = 'Pick a name for your visit!'; return; }
    busy = true;
    const r = await checkName(name);
    busy = false;
    if (r.state === 'known' || r.state === 'reset') return nameError('That name belongs to someone with a PIN. Pick another name for your visit.');
    who = name;
    show('guest');
  }
  function enterGuest() {
    auth.mode = 'guest'; auth.name = who; auth.token = ''; auth.owner = false;
    profile.id = 'guest-' + randomHex(8); // temporary: never saved, here or on the server
    $('#name-input').value = who;
    opts.enter(false);
  }

  function notYou() {
    if (remembered?.token) post('/api/account/logout', {}, remembered.token);
    store.del('account');
    remembered = null; resumed = false; who = '';
    auth.mode = 'none'; auth.name = ''; auth.token = ''; auth.owner = false;
    Object.assign(profile, opts.fresh());
    store.set('profile', profile);
    opts.refresh();
    opts.remount();
    const n = $('#name-input'); n.value = ''; n.placeholder = 'What should folks call you?';
    const go = $('#go'); if (go.textContent === 'Back to the yard') go.textContent = 'Step outside';
    show('name');
    setTimeout(() => n.focus(), 30);
  }

  return {
    auth,
    get guest() { return auth.mode === 'guest'; },
    get signedIn() { return auth.mode === 'account'; },
    get owner() { return auth.mode === 'account' && auth.owner; },   // the server decides, main.js shows the tools menu
    get view() { return view; },
    // At boot. Back from a game within the welcome-back window, the saved token skips the PIN. Otherwise it only fetches the
    // current name (in case it was renamed on another device) and the PIN is asked.
    async prepare(returning) {
      if (!remembered?.token) return;
      if (!returning) {
        const r = await post('/api/account/name', {}, remembered.token);
        if (r.code === 200 && typeof r.name === 'string' && r.name) { remembered.name = profile.name = r.name; store.set('account', remembered); }
        return;
      }
      const r = await post('/api/account/resume', {}, remembered.token);
      if (r.code === 200 && r.id) {
        auth.mode = 'account'; auth.token = remembered.token; auth.owner = r.owner === true;
        applyServerProfile(r);
        auth.name = r.name;
        remembered.name = r.name; store.set('account', remembered);
        store.set('profile', profile);
        resumed = true;
        opts.refresh();
      }
    },
    // called by showStart() every time the panel opens
    show(isEditing) {
      editing = !!isEditing;
      build();
      if (editing || auth.mode === 'account') { show('name'); return; }
      // this device knows you: your name is filled in and the PIN is asked ("Not you?" switches)
      if (remembered?.name) { who = remembered.name; $('#name-input').value = remembered.name; show('login'); return; }
      show('name');
    },
    go,
    hello() { return auth.mode === 'account' ? { token: auth.token } : auth.mode === 'guest' ? { guest: true } : {}; },
    headers() { return auth.mode === 'account' && auth.token ? { 'x-breneland-token': auth.token } : {}; },
    // { t: 'account' } from the server
    onServer(m) {
      if (!m || typeof m.op !== 'string') return;
      if (m.op === 'guest') {
        if (auth.mode === 'guest' && m.why === 'guest') ui.chatLine(null, null, 'You are visiting as a guest today, so nothing gets saved.', true);
        if (auth.mode === 'account') {
          auth.mode = 'guest'; auth.owner = false;
          ui.chatLine(null, null, 'Your login ran out, so this visit is not being saved. Reload the page to log in again.', true);
        }
        if (typeof m.name === 'string' && m.name && m.name !== profile.name) { profile.name = m.name; opts.refresh(); }
      } else if (m.op === 'renamed' && typeof m.name === 'string' && m.name && auth.mode === 'account') {
        // renamed (here or on another device): follow it
        auth.name = profile.name = m.name;
        if (remembered) { remembered.name = m.name; store.set('account', remembered); }
        store.set('profile', profile);
        opts.refresh();
      } else if (m.op === 'taken' && typeof m.name === 'string' && m.name) {
        profile.name = m.name; opts.refresh();
        ui.toast('That name belongs to someone with a PIN.');
      }
    },
  };
}
