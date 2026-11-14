// Shared vocabularies that travel over the network as small integers.
// ANIM_CODES: what a player is doing (sent as `a` with every position update). Append only, never reorder:
// clients on an older page load would read the wrong index. Max 63 entries (server clamps to 0..63).
export const ANIM_CODES = [
  'idle', 'walk', 'run', 'jump', 'wave', 'dance', 'cheer', 'sit', 'highfive', 'laugh', 'point', // 0-10 emotes and locomotion
  'fish', 'cast', 'reel', 'hook', 'catch', 'throw',                                              // 11-16 fishing and treats
  'swing', 'swingfly', 'push',                                                                   // 17-19 the tire swing
  'bowl',                                                                                         // 20 bocce: at the line (bocce.js draws the underhand arm)
  'climb',                                                                                        // 21 on the water tower (water-tower.js)
  'swim',                                                                                         // 22 in Oyster Cove (swim.js)
  'vault',                                                                                        // 23 over a fence (player.js tryVault)
  'ballet', 'ballroom', 'hiphop',                                                                 // 24-26 the dance wheel's dances (hold Dance)
  'lie',                                                                                          // 27 lying on a bed in our house (house-rest.js)
];

// HELD_CODES: what is in the right hand (sent as `h`, the server keeps 0..15). Human.setHeld(kind) draws it. Append only.
// 'rod' is Kevin's stick rod; 'rod-<pole>' are the Fish Shack's other poles (fish-gear.js rodHeld): a remote
// player's pole travels with every position update like any held thing (the lure on it travels in ext.bait).
export const HELD_CODES = [null, 'rod', 'treat', 'fish', 'rod-bamboo', 'rod-spinner', 'rod-lucky', 'gamebox']; // (7 gamebox: table-games, a board game's box carried)

// How long each emote plays (seconds; sit and the dances until you move). Shared by the local player and the remotes, so an
// emote ends at the same moment on every screen.
export const EMOTE_TIME = { wave: 2.4, dance: 4.5, cheer: 2.2, sit: Infinity, highfive: 1.6, laugh: 2.2, point: 2.2, ballet: Infinity, ballroom: Infinity, hiphop: Infinity };
export const emoteTime = e => EMOTE_TIME[e] || 2;

// Anims that keep playing for a remote player even while they move (they are pinned in place or moving on rails).
export const PINNED_ANIMS = new Set(['fish', 'cast', 'reel', 'hook', 'catch', 'swing', 'swingfly', 'push', 'bowl', 'climb', 'swim', 'lie']);
