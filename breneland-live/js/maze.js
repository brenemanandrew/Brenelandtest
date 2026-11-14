// Beneath Angell Street: the door in the Lovecraft house's hall (between the parlour's doorway and the staircase), the card at it
// (Start your own / Join <name>'s / Not now), the way down into the maze scene (maze-scene.js, loaded only then), the instance on
// the server (lib/maze.js: who's in it, the seed, positions relayed to its members only) and the way back up. While you're below
// the yard is paused and not drawn (main.js hands the frame to ctx.below), the lobby connection stays (chat works from below), and
// your lobby body stands by the door with "(in the maze)" on its tag and in the people list. The door opens on the days the house
// is open (lovecraft-days.js).
import { houseGame, houseOpen, nextOpen, daysText, playDaysOf } from './lovecraft-days.js';
// extra open days for the door only, Eastern dates (for testing)
const EXTRA_DAYS = [Date.UTC(2026, 9, 30, 17)].map(easternDay);
import { el, loadCss } from './util.js';
import { seedForDay, weekOf, goalForWeek, GOALS } from './maze-gen.js'; // (seedForDay: the week's seed for a day; one maze a week, w16-phase4; goalForWeek: the week's goal, w16-goals)
import { easternDay } from './wreath-data.js';
import { createMazeDoor } from './maze-door.js'; // the door when it's open
import { createMazeStory, GOAL_TEXT } from './maze-story.js';     // the story card on the way down, and the week's goal in words
import { createMazeGather } from './maze-gather.js';   // the gathering at the top of the stair
import { mountMazeSettings } from './maze-settings.js'; // look speed and look assist on Settings > Controls
import { createPicker, byId as invById } from './maze-investigators.js'; // who you go down as
import { createBulkhead } from './maze-bulkhead.js'; // the way out comes up through the cellar bulkhead in the back garden

export const DOOR_U = 2.9;       // the shut door in the hall's back wall (lovecraft-build.js shutDoor at u 2.9, v BV + 0.1)
const NEAR = 2.6; // m from the spot in front of it (far enough that standing in the hall looking at the door gets this prompt)
const MAX = 4;

export function createMaze(ctx) {
  const { player, ui, audio, net, config, input, store } = ctx;
  loadCss('/css/maze.css');
  const gm = houseGame(config?.games);
  const now = () => net.serverNow();
  const isOpen = () => !gm || houseOpen(gm, now()) || EXTRA_DAYS.includes(easternDay(now()));
  let lc = null, spot = null;  // the Lovecraft house feature and the spot in front of the door (found once the features exist)
  let bulkhead = null;
  const house = () => { if (lc) return lc; lc = ctx.features?.find(f => f.name === 'lovecraft') || null; if (lc) { const P = lc.plan; spot = { x: P.HX + DOOR_U, z: P.HZ + P.BV + 0.1 + 0.95, yaw: Math.PI }; if (P) bulkhead = createBulkhead(ctx, P); } return lc; };
  const door = createMazeDoor(ctx, { isOpen, house, u: DOOR_U }); // light under it, mist, the hall, its sounds: open days only

  // ---- the card
  const card = el('div', 'mz-card panel', '', { hidden: '', role: 'dialog', 'aria-label': 'Beneath Angell Street' });
  const cTitle = el('div', 'mz-title', 'Beneath Angell Street'), cBlurb = el('div', 'mz-blurb', ''), cWhen = el('div', 'mz-when', ''), cBtns = el('div', 'mz-btns');
  card.append(cTitle, cBlurb, cWhen, cBtns); ctx.hud.append(card);
  let runs = [], listSeed = 0, listDay = 0, listWeek = 0, savedHook = null;
  // a seed of your own for a run (tests and pictures): ?mzseed= on the URL or window.__mzSeed; the server honours it off Fly only
  const seedOverride = () => { const q = new URLSearchParams(location.search).get('mzseed'), v = window.__mzSeed ?? (q ? Number(q) : null); return Number.isInteger(v) && v > 0 ? v : null; };
  // and a goal of your own (tests and pictures): ?mzgoal= or window.__mzGoal; off Fly only (w16-goals)
  const goalOverride = () => { const v = window.__mzGoal ?? new URLSearchParams(location.search).get('mzgoal'); return GOALS.includes(v) ? v : null; };
  const btns = () => [...cBtns.querySelectorAll('button')];
  function fillCard() {
    const open = isOpen();
    cBlurb.textContent = open ? 'A narrow stair goes down under the house, and under the stair there is a maze. It is very dark down there. Find the way out, or come back up the way you went down.'
      : 'The door is locked today.';
    cWhen.textContent = open ? (runs.length ? `${runs.length === 1 ? 'A friend is' : 'Friends are'} down there now. Join them, or go your own way.` : 'Nobody is down there right now.')
      : (gm ? `It opens ${daysText(playDaysOf(gm))}. Next: ${nextOpen(gm, now())}.` : '');
    cWhen.classList.toggle('closed', !open);
    cBtns.replaceChildren();
    if (open) {
      const b = el('button', 'btn primary', 'Start your own', { type: 'button' }); b.onclick = () => { hideCard(); start(); }; cBtns.append(b);
      for (const r of runs) {
        const full = r.n >= MAX;
        const j = el('button', 'btn', `Join ${r.host}'s (${r.n} of ${MAX})`, { type: 'button' }); if (full) j.disabled = true;
        j.onclick = () => { hideCard(); join(r.id); }; cBtns.append(j);
        if (r.down && !full) { const late = lateLine(r); if (late) cBtns.append(el('div', 'mz-late', late)); } // who actually went down
      }
    }
    const no = el('button', 'btn', 'Not now', { type: 'button' }); no.onclick = hideCard; cBtns.append(no);
  }
  // "Bob has already gone down" / "Ann and Bob have..." (only the ones down there now, the host may still be at the top)
  function lateLine(r) {
    const n = Array.isArray(r.downNames) ? r.downNames : null;
    if (!n) return `${r.host}'s party has already gone down: you will be on your own until you find them.`; // an older server
    if (!n.length) return '';
    const who = n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
    return `${who} ${n.length === 1 ? 'has' : 'have'} already gone down: you will be on your own until you find them.`;
  }
  function showCard() {
    fillCard();
    card.hidden = false; player.controls = false;
    net.send({ t: 'maze', op: 'list' });
    audio.ui?.('pop');
    savedHook = input.menuHook;
    input.menuHook = dir => { if (card.hidden) return false; if (dir === 'up' || dir === 'down') moveFocus(dir === 'up' ? -1 : 1); return true; };
    btns()[0]?.focus({ preventScroll: true });
    setTimeout(() => { if (!card.hidden && !document.activeElement?.closest?.('.mz-card')) btns()[0]?.focus({ preventScroll: true }); }, 20);
  }
  function hideCard() { if (card.hidden) return; card.hidden = true; input.menuHook = savedHook; savedHook = null; if (ctx.playing && !below) player.controls = true; }
  function moveFocus(d) { const list = btns().filter(b => !b.disabled); if (!list.length) return; const i = list.indexOf(document.activeElement); const n = i < 0 ? 0 : (i + d + list.length) % list.length; list[n].focus({ preventScroll: true }); }

  // ---- the instance: the server's word
  let run = null;       // { id, seed, members } while you are in one
  let scene = null, below = null, going = false, pending = null;
  const sceneUrl = './maze-scene.js';
  // the story card in the dark on the way down, then the gathering at the top of the stair (lib/maze-party.js)
  const story = createMazeStory(ctx), gather = createMazeGather(ctx, { getRun: () => run, comeUp: how => comeUp(how) });
  mountMazeSettings({ input, audio });
  const picker = createPicker(ctx); // the lineup of heads before the stair
  net.on('maze', m => {
    switch (m.op) {
      case 'list': runs = m.runs || []; listSeed = m.seed; listDay = m.day; listWeek = m.week | 0; if (!card.hidden) fillCard(); break;
      case 'enter':
        if (m.rejoin) { // back in the same run after the socket dropped: the friends as the server has them now
          if (!below || !scene) break;
          run = { id: m.id, seed: m.seed, members: m.members || [], key: m.key, inv: m.inv || run?.inv || null, invs: run?.invs || [] };
          const now = new Set(run.members.map(x => x.sid));
          for (const sid of [...scene.remotes.keys()]) if (!now.has(sid)) scene.removeRemote(sid);
          for (const x of run.members) scene.addRemote(x);
          break;
        }
        run = { id: m.id, seed: m.seed, members: m.members || [], key: m.key, inv: m.inv || null, invs: [], gates: m.gates || null, goal: m.goal || null }; if (pending) { const p = pending; pending = null; p(run); } break;
      case 'goal': if (run && m.id === run.id) { run.goal = m.refused ? run.goal : m; scene?.goals?.onMsg(m); } break; // the week's goal's state (maze-goals.js)
      case 'member': if (!run || m.id !== run.id) break; if (m.add) { run.members.push(m.add); scene?.addRemote(m.add); if (below && !m.back) ui.chatLine(null, null, `${m.add.name} came down the stair.`, true); } if (m.gone !== undefined) { run.members = run.members.filter(x => x.sid !== m.gone); scene?.removeRemote(m.gone); } break;
      case 'pos': if (scene && run && m.sid !== net.sid) scene.remotePos(m); break;
      case 'invs': if (run && m.id === run.id) { run.invs = m.list || []; scene?.setParty?.(run.invs); } break; // who's below as whom, who's taken
      case 'full': ui.toast('That one is full (four at most). Start your own?'); if (ctx.playing && !below) player.controls = true; break;
      case 'gone':
        if (m.rejoin) { if (below) ui.toast('The connection was gone too long: the others carried on without you. Go back up to join them again.', 5200); break; }
        ui.toast('They have gone on without you. Start your own?'); if (ctx.playing && !below) player.controls = true; break;
    }
  });
  const askRun = op => new Promise(res => { pending = res; net.send({ t: 'maze', op: op.op, id: op.id, inv: op.inv, seed: op.seed || undefined, goal: op.goal || undefined }); setTimeout(() => { if (pending === res) { pending = null; res(null); } }, 4000); });
  // the lineup first: a head someone in that run already has is greyed (the list's `invs`). The server has the last word: ask for
  // one just taken and you get a random free one, and a toast says which
  async function choose(r) {
    const taken = new Map();
    if (r) (r.invs || []).forEach((inv, i) => { if (inv) taken.set(inv, (r.names || [])[i] || 'Someone'); });
    if (window.__mzPick) return window.__mzPick; // for the tests: tools/harness.mjs sets 'none', a plain player without the lineup (the investigators' own tests clear it)
    player.controls = false;
    const inv = await picker.open({ taken });
    if (!inv && ctx.playing && !below) player.controls = true;
    return inv;
  }
  const said = (want, r) => { if (r && want && want !== 'random' && r.inv && r.inv !== want) ui.toast(`Someone took ${invById(want)?.role.replace('The ', 'the ')} first. You are ${invById(r.inv)?.role.replace('The ', 'the ')}.`, 4200); return r; };
  async function start() { if (net.status !== 'online') { ui.toast('You need to be online to go down.'); return; } const inv = await choose(null); if (!inv) return; await descend(() => askRun({ op: 'start', inv, seed: seedOverride(), goal: goalOverride() }).then(r => said(inv, r))); }
  async function join(id) { if (net.status !== 'online') { ui.toast('You need to be online to go down.'); return; } const inv = await choose(runs.find(r => r.id === id)); if (!inv) return; await descend(() => askRun({ op: 'join', id, inv }).then(r => said(inv, r))); }

  // the ambience beds' own gain (audio.js `amb`, the beds' fade-in, not the Ambience slider): 0 below, 1 up
  const beds = on => { try { const a = audio; if (a?.amb && a.ctx) a.amb.gain.setTargetAtTime(on ? 1 : 0, a.ctx.currentTime, on ? 1.5 : 0.6); } catch { /* no audio yet */ } };
  // ---- down: the fade, the scene built in the dark, the yard paused (a takeover holds your lobby body; the music stops: minigame)
  async function descend(ask) {
    if (upP) await upP.catch(() => {});
    if (going || below) return;
    going = true;
    player.controls = false; ui.hint(null);
    ui.el.fade.style.background = '#000';
    const fadeP = ui.fade(1, 650);
    audio.door?.('open', spot.x, player.pos.y + 1.2, spot.z - 0.9);
    const [r, mod] = await Promise.all([ask(), import(sceneUrl).catch(e => { console.error('[maze] could not load the scene', e); return null; }), fadeP]);
    if (!r || !mod) {
      ui.el.fade.style.background = ''; ui.fade(0, 400);
      if (!r) ui.toast('The stair is blocked right now. Try again in a moment.');
      going = false; if (ctx.playing) player.controls = true;
      return;
    }
    const phone = ctx.hudLayout?.layout === 'phone' || (input.lastDevice === 'touch');
    try {
      scene = mod.createMazeScene(ctx, { seed: r.seed, onOut: how => comeUp(how), phone, inv: r.inv, gates: r.gates, goal: r.goal }); // gates: the ones already down; goal: the week's goal's state
    } catch (e) { console.error('[maze] could not build the maze', e); ui.el.fade.style.background = ''; ui.fade(0, 400); going = false; if (ctx.playing) player.controls = true; net.send({ t: 'maze', op: 'leave' }); run = null; return; }
    for (const m of r.members) scene.addRemote(m);
    scene.setParty?.(r.invs || []);
    // the yard: paused and hidden. A takeover keeps your lobby body still by the door (and tells the music to stop: minigame),
    // the HUD's yard pieces step aside (css), and main.js hands every frame to ctx.below from here on
    player.takeover = { anim: 'idle', minigame: 'maze', update() {}, camera() { return true; } };
    player.place(spot.x, spot.z - 0.3, 0);
    ctx.hud.classList.add('mz-below');
    ui.setPlace('Beneath Angell Street');
    ui.el.toasts.replaceChildren(); // a yard tip still on screen (the dog walk's, say) doesn't follow you down
    below = scene; ctx.below = scene;
    beds(false); // the yard's wind, birds and surf go quiet: drips and your steps are the maze's sound
    going = false;
    // the story in the dark (the maze is built behind it), then up out of the black at the top of the stair, the gathering. Back
    // steps away up into the hall. The tests' skipStair goes straight down, alone.
    scene.hold = 'story';
    story.setGoal((GOAL_TEXT[r.goal?.goal] || GOAL_TEXT.escape).story); // the week's goal, in a sentence
    const skip = scene.skipStair; scene.skipStair = function () { story.hide(); gather.skip(this); return skip.call(this); };
    story.show({
      go: () => { if (below !== scene) return; ui.fade(0, 700).then(() => { if (scene?.phase === 'stair') ui.el.fade.style.background = ''; }); gather.arrive(scene); },
      back: () => comeUp('stair'),
    });
  }
  // ---- up: by the exit (the back garden, by the fountain) or the stair (the hall); the yard resumes where it was
  // (a new trip down waits for the last trip up to finish: its fade is awaited before it clears the run, or a quick Start in that
  // half second has its new run cleared under it)
  let upP = null;
  function comeUp(how) { if (!below) return Promise.resolve(); const p = comeUpNow(how); upP = p; p.finally(() => { if (upP === p) upP = null; }); return p; }
  async function comeUpNow(how) {
    if (!below) return;
    const sc = below; below = null; ctx.below = null;
    story.hide(); gather.hide();
    const exit = how === 'exit', wake = how === 'taken' && sc.ghoul?.wake; // taken: you wake in front of the main house
    if (!exit) { ui.el.fade.style.background = '#000'; await ui.fade(1, 500); }
    net.send({ t: 'maze', op: 'leave' }); run = null;
    sc.dispose(); scene = null;
    beds(true);
    ctx.hud.classList.remove('mz-below');
    player.takeover = null;
    const P = house()?.plan;
    if (exit && bulkhead) bulkhead.emerge(); // up out of the cellar bulkhead by the fountain, the doors open, the camera from your eyes
    else if (exit && P) { const fx = P.HX - 0.6 + 2.6, fz = P.HZ - P.HD - 7.6 + 1.6; player.place(fx, fz, Math.atan2(P.HX - fx, P.HZ - P.HD - fz)); player.snapCameraBehind(); }
    else if (spot) { player.place(spot.x, spot.z, Math.PI); player.snapCameraBehind(); }
    player.houseSolid = true;
    if (ctx.playing) player.controls = true;
    if (wake) { wake(); return; }
    ui.fade(0, exit ? 900 : 600).then(() => { ui.el.fade.style.background = ''; });
    if (exit) { if (!ctx.mazeResult?.exited()) ui.toast('You found the way out! Daylight, at last.', 4200); audio.ui?.('chime'); } // maze-result.js says it: the escape card, or this
    else ui.toast('Back in the hall. The door shuts behind you.', 2600);
  }

  // ---- the lobby shows who is below: the name tag and the people list say "(in the maze)" (main.js reads ext.maze for the list)
  const tagOf = r => { if (!r?.tag) return; const want = r.ext?.maze ? `${r.name} (in the maze)` : r.name; if (r.tag.node.textContent !== want) r.tag.node.textContent = want; };
  net.on('ext', m => { if (m.sid !== net.sid && 'maze' in (m.ext || {})) tagOf(ctx.remotes.map.get(m.sid)); });
  net.on('welcome', () => { for (const r of ctx.remotes.map.values()) tagOf(r); });
  // the socket dropped while you were below and came back (a new session): back into the same run, carry on
  net.on('welcome', () => { if (below && run?.key) net.send({ t: 'maze', op: 'rejoin', id: run.id, key: run.key }); });
  net.on('join', m => tagOf(ctx.remotes.map.get(m.p?.sid)));
  net.on('profile', m => setTimeout(() => tagOf(ctx.remotes.map.get(m.sid)), 0));

  const api = {
    name: 'maze',
    get spot() { house(); return spot; },
    get open() { return isOpen(); },
    get cardOpen() { return !card.hidden; },
    get cardButtons() { return btns().map(b => b.textContent); },
    get cardWhen() { return cWhen.textContent; }, get cardLate() { return [...cBtns.querySelectorAll('.mz-late')].map(e => e.textContent); },
    get runs() { return runs; },
    get run() { return run; },
    get scene() { return scene; },
    get below() { return !!below; },
    get seedToday() { return seedForDay(easternDay(now())); }, // (the week's)
    get week() { return weekOf(easternDay(now())); },
    get goalToday() { return goalForWeek(weekOf(easternDay(now()))); }, // (the week's goal: w16-goals)
    get listSeed() { return listSeed; },
    get listDay() { return listDay; },
    get listWeek() { return listWeek; },
    seedOverride, goalOverride,
    showCard, hideCard, start, join, comeUp,
    update(dt) { house(); door.update(dt); bulkhead?.update(dt); },
    get bulkhead() { house(); return bulkhead; },
    door,
    story, gather,
    picker,
    target(px, pz) {
      if (below) return null;
      if (!card.hidden) return { hint: 'E  Not now', prio: 9, run: hideCard };
      if (picker.open_) return { hint: 'E  Not now', prio: 9, run: picker.close };
      const h = house(); if (!h || !spot || !h.inside()) return null;
      if (Math.hypot(px - spot.x, pz - spot.z) > NEAR || pz < spot.z - 0.85) return null; // the hall side only, not through the wall from the stair
      return { hint: isOpen() ? 'E  Beneath Angell Street - go down?' : `E  Beneath Angell Street (opens ${nextOpen(gm, now())})`, prio: 7, run: showCard };
    },
    onKey(code) {
      if (below && (story.onKey(code) || gather.onKey(code))) return true; // the story card, the gathering
      if (below) return scene ? scene.onKey(code) : false;
      if (picker.onKey(code)) return true; // the lineup
      if (card.hidden) return false;
      if (code === 'Escape') { hideCard(); return true; }
      if (code === 'KeyE') { if (input.lastDevice === 'pad' && document.activeElement?.closest?.('.mz-card')) document.activeElement.click(); else hideCard(); return true; }
      if (code === 'Enter' || code === 'NumpadEnter') { const a = document.activeElement?.closest?.('.mz-card') ? document.activeElement : btns()[0]; a?.click(); return true; }
      if (code === 'ArrowUp' || code === 'ArrowDown') { moveFocus(code === 'ArrowUp' ? -1 : 1); return true; }
      return true; // a card is open, the yard's keys wait
    },
    help: [[['E'], 'go down beneath Angell Street from the door in the Lovecraft house\'s hall (on its open days)'], [['Shift'], 'run in the maze (watch your breath)'], [['F'], 'in the maze: first person or over your shoulder']],
  };
  // closing the page while below: the socket's close is the server's word (lib/maze.js onLeave); nothing else to do here
  return api;
}
