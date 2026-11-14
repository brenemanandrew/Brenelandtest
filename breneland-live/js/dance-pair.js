// Partners, run after the remotes are placed every frame.
//  - Ballroom: two ballroom dancers within PAIR_D pair up, by the same rule on every screen. The lower session id leads, each is
//    the other's params.mate (the hands meet by IK), and both step to the server clock. They turn slowly round where they paired.
//    Your own player is pinned to its place in the pair. Alone you dance round an invisible partner.
//  - High fives: whoever you high-five (or a remote's emote message names) is params.mate, so the raised hands meet.
import { BALLROOM_GAP } from './bodies-poses.js';

export const PAIR_D = 2.6;      // m: two ballroom dancers this near pair up
export const PAIR_TURN = 0.35;  // rad/s the pair turns round its middle
const IN_SECS = 0.6;            // s: you glide into your place in the pair

export function createDancePair(ctx) {
  const { player, remotes, net } = ctx;
  const pairs = new Map();      // a sid -> its pair { a, b (sids, a leads), cx, cz, th, t0 }
  const _pin = { x: 0, z: 0, yaw: 0 };
  let inT = 0;
  const now = () => net.serverNow() / 1000;
  // who is dancing ballroom: [{ sid, x, z, ch }] (you, if you are)
  const dancers = [];
  function gather() {
    dancers.length = 0;
    if (player.emote === 'ballroom' && !player.takeover && net.sid) dancers.push({ sid: net.sid, x: player.pos.x, z: player.pos.z, ch: player.character, me: true });
    for (const r of remotes.map.values()) if (r.ch.anim === 'ballroom') { const p = r.ch.root.position; dancers.push({ sid: r.sid, x: p.x, z: p.z, ch: r.ch }); }
  }
  const find = sid => dancers.find(d => d.sid === sid);
  function clear(ch) { if (!ch) return; ch.params.role = null; ch.params.clock = undefined; ch.params.mate = null; }

  return {
    name: 'dance-pair',
    pairs,
    afterRemotes(dt) {
      gather();
      // pairs that ended: one stopped dancing or is gone
      for (const P of new Set(pairs.values())) if (!find(P.a) || !find(P.b)) { pairs.delete(P.a); pairs.delete(P.b); clear(P.cha); clear(P.chb); } // (both: the one who stopped too)
      // new pairs: the nearest unpaired dancers, closest first (the same answer on every screen for the same people)
      for (;;) {
        let best = null, bd = PAIR_D;
        for (let i = 0; i < dancers.length; i++) for (let j = i + 1; j < dancers.length; j++) {
          const A = dancers[i], B = dancers[j]; if (pairs.has(A.sid) || pairs.has(B.sid)) continue;
          const d = Math.hypot(A.x - B.x, A.z - B.z); if (d < bd) { bd = d; best = [A, B]; }
        }
        if (!best) break;
        const [A, B] = best[0].sid < best[1].sid ? best : [best[1], best[0]];
        const P = { a: A.sid, b: B.sid, cha: A.ch, chb: B.ch, cx: (A.x + B.x) / 2, cz: (A.z + B.z) / 2, th: Math.atan2(B.x - A.x, B.z - A.z), t0: now() };
        pairs.set(A.sid, P); pairs.set(B.sid, P);
        if (A.me || B.me) inT = 0;
      }
      // every dancer: their role, partner and clock (solo: none of these)
      const t = now();
      for (const d of dancers) {
        const P = pairs.get(d.sid), ch = d.ch;
        if (!P) { clear(ch); continue; }
        const lead = P.a === d.sid, o = find(lead ? P.b : P.a);
        ch.params.role = lead ? 'lead' : 'follow'; ch.params.clock = t;
        ch.params.mate = o.me ? player.pos : o.ch.root.position; // (live positions: the hands meet the partner where they are drawn)
        if (d.me) { // your place in the pair: half the gap from the middle, on the turning line, facing the middle
          const th = P.th + PAIR_TURN * (t - P.t0), s = lead ? -1 : 1, g = BALLROOM_GAP / 2;
          const x = P.cx + s * Math.sin(th) * g, z = P.cz + s * Math.cos(th) * g, yaw = Math.atan2(P.cx - x, P.cz - z);
          inT = Math.min(IN_SECS, inT + (dt || 1 / 60));
          const k = inT / IN_SECS, e = k * k * (3 - 2 * k);
          _pin.x = player.pos.x + (x - player.pos.x) * (k >= 1 ? 1 : e * 0.25 + 0.02); _pin.z = player.pos.z + (z - player.pos.z) * (k >= 1 ? 1 : e * 0.25 + 0.02); _pin.yaw = yaw;
          player.pin = _pin;
        }
      }
      if (!pairs.has(net.sid) && player.pin === _pin) player.pin = null;
      // high fives: your mate is whoever you high-fived; a remote's whoever its message named
      if (player.emote === 'highfive' && player.emoteMate && remotes.map.has(player.emoteMate.sid)) player.character.params.mate = player.emoteMate.ch.root.position;
      else if (!pairs.has(net.sid)) player.character.params.mate = null;
      for (const r of remotes.map.values()) {
        if (pairs.has(r.sid)) continue;
        if (r.emote === 'highfive' && r.mateSid) r.ch.params.mate = r.mateSid === net.sid ? player.pos : remotes.map.get(r.mateSid)?.ch.root.position || null;
        else if (r.ch.anim !== 'ballroom') r.ch.params.mate = null;
      }
    },
  };
}
