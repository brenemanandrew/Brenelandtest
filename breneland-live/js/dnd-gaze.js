// The D&D table's looks (gaze.js, for dnd.js). The Dungeon Master talking looks at the one he is talking to: the player whose
// check he asked for, else the one whose turn it is in a fight, else the one who last spoke to him; narrating to all he looks
// round the table slowly, settling on each face. Thinking, down at his notes. A check pending, at that player. Idle between, a
// slow look round the table (unless someone at it is talking: then gaze.js's own rule, he looks at them). Everyone at the table
// watches a thrown die as it rolls. Looking at the DM while he narrates and at the player who speaks is gaze.js's rule (they are
// talking within earshot), so nothing here is needed for it.
import { GAZE, talking } from './gaze.js';

const NARRATE_S = 2.6, IDLE_S = 3.6; // s on each face: narrating to all, and idle
const ANSWER_S = 30;                 // s after a player's line that the DM's next words are to them

// seatOf(i) -> the Human at seat i (a player's avatar, a town folk) or null; dice: dnd.js's list ({ m, settled })
export function createTableGaze({ dmSeat, tableTop, seatOf, dice }) {
  const f = Math.sin(dmSeat.yaw), g = Math.cos(dmSeat.yaw);
  const notes = { x: dmSeat.x + f * 0.62, y: tableTop + 0.04, z: dmSeat.z + g * 0.62 }; // (his screen, on the table in front of him)
  const said = { seat: -1, at: -1e9 };
  const order = [0, 1, 4, 3, 2, 5]; // round the table from his end: the near side, across, the far side, the end
  const faces = [];
  // the face his look settles on now, going round the table a seat at a time
  function round(s, now, pace) {
    faces.length = 0;
    for (const i of order) { const h = seatOf(i); if (h) faces.push(h); }
    if (!faces.length) return null;
    return faces[Math.floor(now / pace) % faces.length];
  }
  const rolling = () => { for (const d of dice) if (d.m.visible && !d.settled) return d.m; return null; };
  const anyTalking = now => { for (let i = 0; i < 6; i++) { const h = seatOf(i); if (h && talking(h, now)) return true; } return false; };
  return {
    said(seat) { said.seat = seat; said.at = GAZE.now; },
    // the DM each frame (h his Human, s the table's state)
    dm(h, s, now, speaking) {
      const check = (s.pending || [])[0], turn = s.combat ? s.combat.order[s.combat.turn] : null;
      if (speaking) {
        const to = (check && seatOf(check.seat)) || (turn && turn.seat != null && seatOf(turn.seat)) || (now - said.at < ANSWER_S && seatOf(said.seat)) || round(s, now, NARRATE_S);
        h.attn.to = to || null; // (null: to nobody, the head held straight)
        return;
      }
      const die = rolling();
      if (die) { h.lookAt(die, 0.3); return; }
      if (s.dm?.busy) { h.lookAt(notes, 0.3); return; }
      if (check) { h.lookAt(seatOf(check.seat) || notes, 0.3); return; }
      if (anyTalking(now)) return; // (gaze.js: at whoever is talking)
      h.lookAt(round(s, now, IDLE_S) || notes, 0.3);
    },
    // the table each frame: a die in the air or rolling has every eye on it
    step(now) {
      const die = rolling(); if (!die) return;
      for (let i = 0; i < 6; i++) { const h = seatOf(i); if (h) h.watch(die, 0.3); }
      void now;
    },
    notes,
  };
}
