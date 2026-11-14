// What the table-game overlay shows now, shared by its parts with no imports of its own (tg-look): mt-ui sets the open table
// when it draws a board, the overlay clears it when it closes, tg-look plays through `sound` and shows through `eye`.
// the tg-board drawing a region (overlay.js makes one; mt-ui asks for it here, so the HUD Editor's preview needs no three.js)
const BOARDS = new WeakMap();
export const boardOf = el => (el && BOARDS.get(el)) || null;
export const setBoardOf = (el, tb) => BOARDS.set(el, tb);
export const LOOK = { openId: null, me: null, dropAt: 0, played: [], sound: () => {}, eye: null, board: null, confettiAt: 0 };
