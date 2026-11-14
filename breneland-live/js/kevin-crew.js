// Kevin's crew: at 7 pm Kevin packs up, wanders round looking for company and takes someone out fishing in his boat. His day and
// the resident he fetches are a pure function of the shared clock (kevin-day.js). This is the players' side of it.
//   - While he's about (7 pm until he pushes off) a player near him gets "E  Go fishing with Kevin". The first to accept claims the
//     thwart (a server-held claim in lib/kevin-crew.js, so every client agrees) and is told to meet him at his boat, where it's
//     "E  Climb aboard". Anyone else may take the last seat (the bow) before it leaves, and then the resident he fetched stays on
//     the pier (npcs.crewBumped). Up to 3 aboard: Kevin plus 2.
//   - Riders sit in their seat (a takeover that follows the boat on every client, a remote rider drawn on their seat in
//     afterRemotes, right where the boat is at the shared time) and can fish from it with their own rod (fishing.js lets a
//     takeover that says fishOK carry the stance). From the boat bites come half as often and every catch is worth 3 fish
//     (lib/fishing.js pays it).
//   - E or a jump steps you off only while she's at the berth. Out on the water E (or a jump) offers "Head back to the pier?".
//     At 11 pm, back at the berth, everyone steps off. A player who disconnects is just taken off the seat.
//   - While YOU are aboard the lobby's sound crossfades to the boat music (boat-music.js, local only).
// ctx.crew = { aboard, riding, seat, boat: { x, z, out }, state, plan, api } (fishing.js reads aboard and boat).
import { kevinBoat, crewPlan, seatWorld, BOARD_SPOTS, BOAT_SEATS, mateRoutine } from './kevin-day.js';
import { DOCK } from './layout.js';
import { loadCss, el } from './util.js';

const REACH_KEVIN = 3.6;     // how near Kevin you must be to be asked along
const REACH_BOARD = 2.4;     // how near a boarding spot on the pier to climb in
export const BOAT_PERK = 'Slow bites out there, but every catch is worth 3 fish.';

export function createKevinCrew(ctx) {
  const { player, net, npcs, remotes, ui, audio } = ctx;
  loadCss('/css/kevin-crew.css');
  let crew = { day: 0, seats: [null, null], aboard: [false, false], bumped: false, names: [null, null] };
  let ride = null;            // { seat: 0 | 1, takeover }
  let pending = null;         // { board, at } a join we sent and have not heard back about
  let P = null, B = null, t = 0, lastU = null, lastKey = null;
  const said = new Set();
  const placed = new Set();   // remote riders we drew on a seat last frame
  const kevin = () => npcs.npcs.find(d => d.kevin) || null;
  const mateDef = () => (P && P.mate ? npcs.npcs.find(d => d.crewPool && d.name === P.mate) || null : null);
  const valid = () => !!P && P.on && crew.day === P.key;
  const mySeat = () => (valid() ? crew.seats.indexOf(net.sid) : -1);
  const freeSeat = () => (valid() ? crew.seats.indexOf(null) : 0);
  const fishing = () => ctx.features?.find?.(f => f.name === 'fishing') || null;

  // ---- the "Head back to the pier?" card
  const card = el('div', 'crew-card', '', { role: 'dialog', 'aria-label': 'Head back to the pier' });
  card.hidden = true;
  card.append(el('h3', '', 'Head back to the pier?'), el('p', '', 'Kevin will carry on fishing. You can hop off and be back on the boards.'));
  const btns = el('div', 'crew-btns');
  const bBack = el('button', 'crew-back', 'Head back', { type: 'button' });
  const bStay = el('button', 'crew-stay', 'Stay aboard', { type: 'button' });
  btns.append(bBack, bStay); card.append(btns);
  (ctx.hud || document.body).append(card);
  bBack.onclick = () => { closeCard(); stand('headback'); };
  bStay.onclick = () => closeCard();
  const openCard = () => { card.hidden = false; try { bBack.focus({ preventScroll: true }); } catch { /* old browsers */ } };
  const closeCard = () => { card.hidden = true; try { bBack.blur(); bStay.blur(); } catch { /* fine */ } };

  // ---- the server's word on the seats
  net.on('crew', m => {
    const before = crew.seats.slice();
    crew = { day: m.day | 0, seats: m.seats || [null, null], aboard: m.aboard || [false, false], bumped: !!m.bumped, names: m.names || [null, null] };
    if (!P) P = crewPlan(net.serverNow() / 1000);
    // somebody new said yes: Kevin answers them (on every screen)
    const k = kevin();
    crew.seats.forEach((sid, i) => {
      if (sid === null || before.includes(sid) || crew.day !== P.key) return;
      const name = crew.names[i];
      if (!k || !k.body.root.visible) return;
      const atBoat = !!(k._s && k._s.inBoat) || (sid === net.sid && pending && pending.board);
      npcs.say(k, atBoat ? `Welcome aboard${name ? ', ' + name : ''}!` : sid === net.sid ? "Grand. Boat's at the pier." : `Grand${name ? ', ' + name : ''}. To the boat.`, 4);
    });
    if (pending && mySeat() >= 0) {
      const s = mySeat(), board = pending.board; pending = null;
      if (board) sit(s);
      else ui.toast('You are going fishing with Kevin! Meet him at his boat by the pier. ' + BOAT_PERK, 5200);
    } else if (pending && m.full) { pending = null; ui.toast('Kevin\'s boat is full tonight.', 2600); }
    // the server took my seat away (a newer day, a timeout) while I sat in it
    if (ride && mySeat() !== ride.seat && crew.day === P.key) stand('gone');
  });

  function join(board) {
    if (!P || pending) return;
    pending = { board, at: performance.now() };
    net.send({ t: 'crew', op: 'join', day: P.key });
    setTimeout(() => { if (pending && performance.now() - pending.at > 2900) pending = null; }, 3000);
  }

  // ---- riding
  function seatPose(i) { return seatWorld(kevinBoat(t).boat, i + 1, t); }
  function sit(i) {
    if (ride) return;
    closeCard();
    const S = BOAT_SEATS[i + 1];
    const tk = {
      anim: 'sit', fishOK: true, alive: true, kevinCrew: true,
      update(dt, now, inp, pl) {
        const b = kevinBoat(npcs.lastT || t).boat, p = seatWorld(b, i + 1, npcs.lastT || t);
        pl.pos.set(p.x, p.y, p.z);
        const anchored = b.out && !b.moored && !b.speed && !b.turning;
        pl.yaw = b.yaw + (anchored ? S.side * Math.PI / 2 : 0);
        pl.grounded = true;
      },
    };
    ride = { seat: i, takeover: tk };
    if (player.takeover && player.takeover !== tk) { fishing()?.debug?.endFishing?.('boarding'); }
    player.takeover = tk; player.emote = null;
    player.character.params.seatY = S.seat;
    net.send({ t: 'crew', op: 'board' });
    audio.play?.('boat-creak', player.pos.x, 0.6, player.pos.z);
    ui.toast('Aboard Kevin\'s boat! ' + BOAT_PERK + ' E or Space steps off while she is tied up.', 5200);
  }
  function stand(reason) {
    if (!ride) return;
    const i = ride.seat, tk = ride.takeover;
    tk.alive = false;
    ride = null;
    closeCard();
    if (player.takeover && player.takeover !== tk) fishing()?.debug?.endFishing?.('boat');   // the rod stance on top of the seat
    if (player.takeover === tk) player.takeover = null;
    player.character.params.seatY = 0;
    const s = BOARD_SPOTS[i + 1];
    player.pos.set(s[0], DOCK.y, s[1] + 0.25); player.yaw = 0;
    player.collide?.();
    if (reason !== 'gone') net.send({ t: 'crew', op: 'leave' });
    if (reason === 'headback') ui.toast('Back on the pier. Kevin waves from the boat.', 3000);
    else if (reason === 'home') { ui.toast('Back at the pier. "Good night for it," says Kevin.', 4200); }
  }

  // ---- what Kevin and his companion say, on the shared clock (once each, as the moment passes)
  function speech() {
    if (!P || !P.on) { lastU = null; return; }
    if (lastKey !== P.key) { said.clear(); lastKey = P.key; lastU = null; }
    const u = P.u;
    if (lastU !== null && u >= lastU && u - lastU < 5) {
      P.e.says.forEach((e, idx) => {
        if (e.u <= lastU || e.u > u) return;
        const d = e.who === 'k' ? kevin() : mateDef();
        if (e.who === 'c' && !d) return;
        if (d && d.body.root.visible) npcs.say(d, e.text, 4.5);
      });
      // the companion out on the water: now and then "Got one!"
      const m = mateDef();
      if (m && m._s && m._s.crew === 'aboard' && m._s.say) {
        const key = 'c' + m._s.cycle;
        if (!said.has(key)) { said.add(key); npcs.say(m, m._s.say, 3); audio.play?.('fish-plink', m.body.root.position.x, 0.1, m.body.root.position.z); }
      }
    }
    lastU = u;
  }

  const api = {
    get aboard() { const i = mySeat(); return !!ride && i >= 0 && !!crew.aboard[i]; },
    get riding() { return !!ride; },
    get seat() { return ride ? ride.seat : -1; },
    boat: null,
    get state() { return crew; },
    get plan() { return P; },
    sit, stand, join, openCard, closeCard, card,
    seatPose,
  };
  ctx.crew = api;

  return {
    name: 'kevincrew',
    api,
    update(dt, now) {
      t = npcs.lastT || net.serverNow() / 1000;
      P = crewPlan(t);
      B = kevinBoat(t).boat;
      api.boat = { x: B.x, z: B.z, out: !!B.out, yaw: B.yaw, moored: !!B.moored };
      npcs.crewBumped = valid() && crew.bumped;
      speech();
      const mine = mySeat();
      if (ride) {
        const fishingOn = !!fishing()?.debug && fishing().debug.state !== 'off';   // the rod stance rides on top of the seat
        if (player.takeover !== ride.takeover && !fishingOn) {
          // something else took you over (the editor, a game): you are off the boat
          ride.takeover.alive = false; player.character.params.seatY = 0; ride = null; net.send({ t: 'crew', op: 'leave' });
        } else if (!P.on || P.disembark) stand('home');
        ctx.quests?.set('kevin-crew', { title: 'Fishing with Kevin', text: P.out ? (B.speed ? 'Sailing out with Kevin' : 'Slow bites, every catch is worth 3 fish') : 'Aboard, waiting to cast off', prio: 3 });
      } else if (mine >= 0) {
        if (!P.canBoard) { net.send({ t: 'crew', op: 'leave' }); ui.toast('Kevin sailed without you. Catch him tomorrow at 7!', 3600); crew.seats[mine] = null; }
        else ctx.quests?.set('kevin-crew', { title: 'Fishing with Kevin', text: 'Meet Kevin at his boat by the pier', prio: 3 });
      } else ctx.quests?.clear('kevin-crew');
      audio.setMusicMode?.(ride ? 'boat' : 'lobby');
    },
    // main.js, after remotes.update: a remote rider sits on their seat, where the boat is at the shared time
    afterRemotes() {
      const now = new Set();
      if (valid()) {
        for (let i = 0; i < 2; i++) {
          const sid = crew.seats[i];
          if (sid === null || sid === net.sid || !crew.aboard[i]) continue;
          const r = remotes.map.get(sid);
          if (!r) continue;
          const p = seatPose(i);
          r.ch.root.position.set(p.x, p.y, p.z);
          r.ch.params.seatY = p.seatY;
          now.add(sid);
        }
      }
      for (const sid of placed) if (!now.has(sid)) { const r = remotes.map.get(sid); if (r) r.ch.params.seatY = 0; }
      placed.clear(); for (const s of now) placed.add(s);
    },
    // remote riders are not obstacles where they sit (crowd.js and player bumps use bodies(); nothing to add)
    target(px, pz) {
      if (!card.hidden) return null;
      if (ride) {
        if (P && P.moored && !P.out) return { hint: 'E  Step off onto the pier', prio: 8, run: () => stand('step') };
        return { hint: 'E  Head back to the pier', prio: 8, run: openCard };
      }
      if (!P || !P.on) return null;
      const mine = mySeat(), free = freeSeat();
      if (P.canBoard && B && B.moored) {
        if (mine >= 0) {
          const s = BOARD_SPOTS[mine + 1];
          if (Math.hypot(px - s[0], pz - s[1]) < REACH_BOARD || Math.hypot(px - B.x, pz - B.z) < 4) return { hint: 'E  Climb aboard Kevin\'s boat', prio: 8, run: () => sit(mine) };
        } else if (free >= 0 && BOARD_SPOTS.slice(1).some(s => Math.hypot(px - s[0], pz - s[1]) < REACH_BOARD)) {
          return { hint: 'E  Take a seat on Kevin\'s boat', prio: 7, run: () => join(true) };
        }
      }
      if (P.canJoin && mine < 0 && free >= 0) {
        const k = kevin();
        if (k && k.body.root.visible && !(k._s && k._s.inBoat) && Math.hypot(k.body.root.position.x - px, k.body.root.position.z - pz) < REACH_KEVIN) {
          return { hint: 'E  Go fishing with Kevin', prio: 7, run: () => join(false) };
        }
      }
      return null;
    },
    onKey(code) {
      if (!card.hidden) {
        if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter') { closeCard(); stand('headback'); return true; }
        if (code === 'Escape' || code === 'Space' || code === 'KeyQ') { closeCard(); return true; }
        return false;
      }
      if (ride && code === 'Space') {
        if (P && P.moored && !P.out) stand('step'); else openCard();
        return true;
      }
      return false;
    },
    help: [[['E'], 'go fishing with Kevin at 7 pm, climb aboard his boat, head back to the pier']],
  };
}
