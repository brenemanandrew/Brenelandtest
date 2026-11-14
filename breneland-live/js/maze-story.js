// Beneath Angell Street: the story, a small parchment card in the dark every time you go down (Start or Join), read while the maze
// is built behind the black. Tap it (or E / Enter / Space, A on a pad) to go on to the top of the stair. Back (Esc / Backspace, B on
// a pad) takes you back up into the hall. setGoal(text) puts the week's goal line under it. Sits above #fade (z 15), below the menus
// (20). Keys come through maze.js onKey, never a focused button: its own Enter click would carry on into the gathering.
import { el, loadCss } from './util.js';

export const STORY = {
  title: 'Beneath Angell Street',
  lines: [
    'Every night something scratches under the Lovecraft house. The Professor\'s lantern went missing, then his pocket watch, then his dog\'s ball. The scratches lead to the old door under the stairs, and the tunnels below run all the way under Providence.',
    'Find the way out on the other side. Keep your lantern lit. Keep quiet. And whatever you hear down there... don\'t stop to look.',
  ],
  gather: 'Gather your party before you go down. Once you go down, you go alone.',
};
// the week's goal (maze-gen.js goalForWeek, w16-goals) in words: one line for the board by the door and the party strip, a
// sentence for the story card, what the things are called, and the distance line's "to the ..." (maze-goals.js)
export const GOAL_TEXT = {
  escape: { board: 'Find the way out.', story: 'This week: just find the way out on the other side.', strip: 'The way out', thing: 'the way out' },
  signs: { board: 'Find the three Elder Signs. They unseal the door.', story: 'This week the door out is sealed. Three Elder Sign stones lie hidden in the rooms and the deep dead ends. Find all three and the seal breaks.', strip: 'Elder Signs', thing: 'an Elder Sign', take: 'Take the Elder Sign' },
  oil: { board: 'Carry the oil cask to the beacon over the door.', story: 'This week the beacon over the door out is dark and the door is shut. Far down there is a cask of lamp oil. Carry it to the door and light the beacon. Mind, it sloshes, and the thing down here has ears.', strip: 'The oil cask', thing: 'the cask', take: 'Pick up the cask', use: 'Light the beacon' },
  scout: { board: 'Find the lost scout and bring them to the door.', story: 'This week one of the cub scouts wandered down here and never came back. Listen for them, find where they are hiding, and bring them to the door. They will follow you. Do not get grabbed.', strip: 'The lost scout', thing: 'the scout', take: 'Found you! Come along' },
  book: { board: "Bring the Professor's stolen book up from the library.", story: "The Professor's book was stolen and carried down here, to the library. Find it and bring it to the door. The thing down here wants it back: once you have it, run.", strip: "The Professor's book", thing: 'the book', take: 'Take the book' },
  pages: { board: 'Gather four pages of the Necronomicon.', story: 'Five pages of the Necronomicon are scattered down here, one in the water. The door opens for the party that holds four. Each page is read aloud by whoever finds it. Well. You will see.', strip: 'Pages', thing: 'a page', take: 'Take the page' },
};
// what each page says, read aloud by its finder (our own lines, nothing from any book)
export const PAGE_LINES = [
  'In the deep places the stone remembers what walked here before the stars were named.',
  'There is a door beneath every door, and a stair beneath every stair, and something climbs.',
  'The lamp that is carried below learns to burn without its bearer.',
  'Speak not the name that is written here, for it listens for its own echo.',
  'The sea keeps what it is given, and the tide keeps count.',
];

export function createMazeStory(ctx) {
  const { input, audio } = ctx;
  loadCss('/css/maze-descent.css');
  const root = el('div', 'mz-story', '', { hidden: '', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mz-story-title' });
  const card = el('div', 'mz-story-card');
  const title = el('div', 'mz-story-title', STORY.title, { id: 'mz-story-title' });
  const flame = el('div', 'mz-story-flame', '', { 'aria-hidden': 'true' });
  card.append(flame, title);
  for (const l of STORY.lines) card.append(el('p', 'mz-story-p', l));
  card.append(el('p', 'mz-story-gather', STORY.gather));
  const goal = el('p', 'mz-story-goal', '', { hidden: '' });
  const btns = el('div', 'mz-story-btns');
  const back = el('button', 'btn mz-story-back', 'Back', { type: 'button', tabindex: '-1' });
  const go = el('button', 'btn primary mz-story-go', 'Go on', { type: 'button', tabindex: '-1' });
  btns.append(back, go);
  const keys = el('div', 'mz-story-keys', '');
  card.append(goal, btns, keys);
  root.append(card);
  document.body.append(root);

  let cb = null, shownAt = 0;
  const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const keyLine = () => input.lastDevice === 'pad' ? `${input.glyph('E')} to go on, ${input.glyph('Esc')} to step back` : input.lastDevice === 'touch' || coarse() ? 'Tap to go on' : 'E or Enter to go on, Esc to step back';
  function show(handlers) {
    cb = handlers; shownAt = performance.now();
    keys.textContent = keyLine();
    root.hidden = false;
    root.classList.remove('in'); void root.offsetWidth; root.classList.add('in');
    audio.ui?.('pop');
  }
  function close(how) {
    if (root.hidden) return false;
    if (performance.now() - shownAt < 200) return true; // the press that opened the door card isn't this one
    root.hidden = true;
    const c = cb; cb = null;
    audio.ui?.('blip');
    if (how === 'go') c?.go?.(); else c?.back?.();
    return true;
  }
  root.addEventListener('click', e => { e.stopPropagation(); close(e.target.closest('.mz-story-back') ? 'back' : 'go'); });
  for (const ev of ['pointerdown', 'touchstart']) root.addEventListener(ev, e => e.stopPropagation(), { passive: true });

  return {
    root,
    get open() { return !root.hidden; },
    show,
    hide() { root.hidden = true; cb = null; },
    go: () => close('go'), back: () => close('back'),
    setGoal(text) { goal.textContent = text || ''; goal.hidden = !text; },
    get text() { return [STORY.title, ...STORY.lines, STORY.gather].join('\n'); },
    onKey(code) {
      if (root.hidden) return false;
      if (code === 'KeyE' || code === 'Enter' || code === 'NumpadEnter' || code === 'Space') { close('go'); return true; }
      if (code === 'Escape' || code === 'Backspace') { close('back'); return true; }
      return true; // the card is up, the rest wait
    },
  };
}
