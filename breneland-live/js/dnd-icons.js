// The D&D table's icons: inline SVG in the HUD's style (indoor-view.js ICON: cream, a bold ink outline), our own constant
// markup, never player text. Shared by the table (dnd.js) and its mock in the HUD Editor (dnd-mock.js). The tray's dice are
// outlines only (the number sits over them), coloured by the CSS.
export const SV = body => '<svg viewBox="0 0 24 24" fill="#fff8ec" stroke="#2b2017" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">' + body + '</svg>';
export const ICON = {
  d20: SV('<path d="M12 2.4l8.3 4.8v9.6L12 21.6l-8.3-4.8V7.2z"/><path d="M12 7.4l5 8.4H7z"/><path d="M12 2.4v5M3.7 7.2L7 15.8M20.3 7.2L17 15.8M12 21.6l-5-5.8M12 21.6l5-5.8" fill="none"/>'),
  mic: SV('<rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7" fill="none"/>'),
  micOff: SV('<rect x="8.5" y="2.5" width="7" height="12" rx="3.5"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M8.5 21.5h7M3.5 3.5l17 17" fill="none"/>'),
  micDot: SV('<rect x="7.5" y="3.5" width="7" height="12" rx="3.5"/><path d="M4.5 12.5a6.5 6.5 0 0 0 13 0M11 19v2.5M7.5 21.5h7" fill="none"/><circle cx="19" cy="5" r="2.8" fill="#2fbf5a"/>'),
  send: SV('<path d="M3 11.6L21 3l-4.6 18-5.2-7.2z"/><path d="M11.2 13.8L21 3" fill="none"/>'),
  swords: SV('<path d="M17.5 3.5L21 7l-13 13-3.5-3.5z"/><path d="M6.5 3.5L3 7l13 13 3.5-3.5z"/><path d="M3.5 16.5l4 4M20.5 16.5l-4 4" fill="none"/>'),
  mug: SV('<path d="M5 6h11v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3z"/><path d="M16 9.5h2.5a2.5 2.5 0 0 1 0 5H16M5 9.5h11" fill="none"/>'),
  scroll: SV('<path d="M7 5h11v14H7z"/><path d="M4 5h3v3H4a1.5 1.5 0 0 1 0-3zM18 16h3a1.5 1.5 0 0 1 0 3h-3"/><path d="M10 9.5h5M10 12.5h5M10 15.5h3" fill="none"/>'),
  speaker: SV('<path d="M4 9.5h4l5-4.5v14l-5-4.5H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none"/>'),
  speakerOff: SV('<path d="M4 9.5h4l5-4.5v14l-5-4.5H4z"/><path d="M15.5 9.5l5 5M20.5 9.5l-5 5" fill="none"/>'),
  book: SV('<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14" fill="none"/>'),
  map: SV('<path d="M3 5l6-2 6 2 6-2v16l-6 2-6-2-6 2z"/><path d="M9 3v16M15 5v16" fill="none"/>'),
  moon: SV('<path d="M14 3a9 9 0 1 0 7 14.5A8 8 0 0 1 14 3z"/>'),
  chairUp: SV('<path d="M4 4h8v7H4z"/><path d="M3 11h10v4H3z"/><path d="M4 15v5M12 15v5M19.5 19V7M16 10.5l3.5-3.5 3.5 3.5" fill="none"/>'),
  star: SV('<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z"/>'),
  d4: SV('<path d="M12 2.5L22 21H2z"/>'),
  d6: SV('<rect x="3" y="3" width="18" height="18" rx="3.5"/>'),
  d8: SV('<path d="M12 1.5L22 12 12 22.5 2 12z"/>'),
  d10: SV('<path d="M12 1.5L21.5 9.5 12 22.5 2.5 9.5z"/>'),
  d12: SV('<path d="M12 1.5l5.25 1.4 3.85 3.85 1.4 5.25-1.4 5.25-3.85 3.85L12 22.5l-5.25-1.4-3.85-3.85L1.5 12l1.4-5.25 3.85-3.85z"/>'),
  die20: SV('<path d="M12 1.5l9.1 5.25v10.5L12 22.5l-9.1-5.25V6.75z"/>'),
  cog: SV('<path d="' + gear(12, 12, 6.6, 9.6, 8) + '"/><circle cx="12" cy="12" r="2.8" fill="#2b2017"/>'),
  eye: SV('<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3.3" fill="#2b2017"/>'),
  x: SV('<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none"/>'),
  fold: SV('<path d="M6 9.5l6 6 6-6" fill="none"/>'),
};
// a gear's outline: n square teeth between radii r0 and r1 (the settings cog, the seal's stamp)
export function gear(cx, cy, r0, r1, n) {
  const pts = [], d1 = Math.PI / n * 0.62, d2 = Math.PI / n * 0.36;
  for (let i = 0; i < n; i++) { const a = i * 2 * Math.PI / n; for (const [da, r] of [[-d1, r0], [-d2, r1], [d2, r1], [d1, r0]]) pts.push((cx + Math.sin(a + da) * r).toFixed(2) + ' ' + (cy - Math.cos(a + da) * r).toFixed(2)); }
  return 'M' + pts.join('L') + 'z';
}
// the tools button: a red wax seal with a rough edge and a cog pressed into it
export const SEAL = (() => {
  const p = []; for (let i = 0; i < 72; i++) { const a = i / 72 * 2 * Math.PI, r = 22 + 1.3 * Math.cos(a * 11) + 0.7 * Math.sin(a * 5 + 1); p.push((24 + Math.sin(a) * r).toFixed(2) + ' ' + (24 - Math.cos(a) * r).toFixed(2)); }
  return '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="dnd-wax" cx="38%" cy="32%" r="72%"><stop offset="0" stop-color="#e0544a"/><stop offset=".5" stop-color="#a8191e"/><stop offset="1" stop-color="#5e0a0f"/></radialGradient></defs>'
    + '<path d="M' + p.join('L') + 'z" fill="url(#dnd-wax)" stroke="#4a0709" stroke-width="1"/>'
    + '<circle cx="24" cy="24" r="14.5" fill="none" stroke="#5e0a0f" stroke-width="2" opacity=".7"/><circle cx="24.6" cy="24.8" r="14.5" fill="none" stroke="#f08a7e" stroke-width="1" opacity=".45"/>'
    + '<path d="' + gear(24, 24, 6.4, 9.4, 8) + '" fill="#7a0e14" stroke="#f2a094" stroke-width=".9" stroke-opacity=".55"/><circle cx="24" cy="24" r="2.6" fill="#c3352f"/></svg>';
})();
export const ico = name => { const i = document.createElement('i'); i.className = 'dnd-ico'; i.innerHTML = ICON[name]; return i; };
