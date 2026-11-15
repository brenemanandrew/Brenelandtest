// A table game other than Mexican Train, in 3D on a real table (game-waves): what passers-by see. The game's board as a flat slab
// in its own colours with a printed border, one little pawn per player in their seat colour in front of their chair (lifted while
// it is their turn), and nothing secret (built from the public view only). The game may say its colours (UI.look3d:
// { board, edge, accent }). Rebuilt only when whose turn it is or the seats change: one batch.
import * as THREE from 'three';
import { Batcher, GEO } from '../batch.js';
import { SEAT_COLORS } from './dominoes.js';

export function createGeneric3D(parent, table, look = {}) {
  const root = new THREE.Group(); root.name = 'tg-gen-' + table.id; root.position.set(table.x, table.top, table.z); parent.add(root);
  const S = Math.max(0.22, Math.min(0.5, table.R * 1.15)); // the board's side (m)
  const col = { board: look.board || '#fbf6ea', edge: look.edge || '#6e4224', accent: look.accent || '#2f6b4f' };
  let meshes = [], key = '';
  const dirOf = chair => { const s = table.seats[chair]; return s ? Math.atan2(s.x - table.x, s.z - table.z) : 0; };
  function build(view, order, phase) {
    const turn = view && phase === 'play' && Number.isInteger(view.turn) ? view.turn : -1;
    const k = (order || []).join(',') + '|' + turn + '|' + phase;
    if (k === key) return; key = k;
    for (const m of meshes) { root.remove(m); m.geometry?.dispose?.(); } meshes = [];
    const b = new Batcher({ vertexColors: true, castShadow: false });
    b.add(GEO.box, col.edge, { x: 0, y: 0.006, z: 0, sx: S + 0.03, sy: 0.012, sz: S + 0.03 });
    b.add(GEO.box, col.board, { x: 0, y: 0.013, z: 0, sx: S, sy: 0.004, sz: S });
    for (const [x, z, sx, sz] of [[0, -S * 0.42, S * 0.9, 0.012], [0, S * 0.42, S * 0.9, 0.012], [-S * 0.42, 0, 0.012, S * 0.9], [S * 0.42, 0, 0.012, S * 0.9]]) b.add(GEO.box, col.accent, { x, y: 0.0158, z, sx, sy: 0.001, sz });
    (order || []).forEach((chair, i) => {
      const a = dirOf(chair), r = S * 0.62, c = SEAT_COLORS[chair % 8], up = i === turn ? 0.02 : 0;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      b.add(GEO.cyl12, c, { x, y: 0.034 + up, z, sx: 0.013, sy: 0.036, sz: 0.013 });
      b.add(GEO.sphere, c, { x, y: 0.058 + up, z, sx: 0.012, sy: 0.012, sz: 0.012 });
    });
    meshes = b.build(root, 'tg-gen-board') || [];
  }
  return {
    root, flying: false,
    update(view, order, phase) { try { build(view, order, phase); } catch (e) { console.error('[tg-gen]', e); } },
    tick() {}, slide() {},
    dispose() { parent.remove(root); root.traverse(o => { o.geometry?.dispose?.(); }); },
  };
}
