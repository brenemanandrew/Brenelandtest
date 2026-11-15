// Word Weave: builds the word list module from the raw lists.
//   node game-waves/tools/word-weave-build-words.mjs
// In:  game-waves/data/enable1.txt (ENABLE, public domain)
//      game-waves/data/blocklist-ldnoobw-en.txt (LDNOOBW English list, CC BY 4.0,
//      https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words)
// Out: game-waves/server/lib/table-games/word-weave-words.js
// Kept: words of 2 to 15 letters (a-z only), minus the blocklist (each entry and its -s / -es plural) and minus a small hand
// list of slurs and rude words (exact words and a few stems). Packed front-coded: sorted words, each one written as one capital
// letter for how many letters it shares with the word before (A = 0, B = 1, ...) and then the rest of it in lower case.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(HERE, '..', 'data');
const OUT = path.join(HERE, '..', 'server', 'lib', 'table-games', 'word-weave-words.js');

// rude words and slurs the blocklist misses or that need every form gone (a stem drops every word starting with it)
const HAND_STEMS = ['fuck', 'shit', 'cunt', 'nigger', 'nigga', 'faggot', 'bitch', 'whore', 'slut', 'twat', 'wank', 'kike', 'gook',
  'dyke', 'piss', 'bastard', 'arsehole', 'asshole', 'dildo', 'jism', 'jizz', 'porn', 'damn', 'bollock', 'boner',
  'spaz', 'wetback', 'redskin', 'tranny', 'lesbo', 'honkie', 'honky', 'darkie', 'raghead'];
const HAND_WORDS = ['homo', 'homos', 'squaw', 'squaws', 'turd', 'turds', 'horny', 'hornier', 'horniest', 'hornily', 'horniness', 'crap', 'crapped', 'crapper', 'crappers', 'crappier', 'crappiest', 'crapping', 'crappy', 'fag', 'fags', 'faggy', 'fagot', 'fagots', 'spic', 'spics', 'spick', 'spicks', 'chink', 'chinks', 'coon',
  'coons', 'retard', 'retards', 'retarded', 'jap', 'japs', 'wop', 'wops', 'dago', 'dagoes', 'dagos', 'kraut', 'krauts', 'gyp',
  'gyps', 'gypped', 'gypping', 'paki', 'pakis', 'hymie', 'yid', 'yids', 'goy', 'goys', 'goyim', 'coolie', 'coolies', 'ass',
  'asses', 'arse', 'arses', 'butthole', 'tits', 'titty', 'titties', 'boob', 'boobs', 'boobie', 'boobies', 'booby', 'cock', 'cocks',
  'dick', 'dicks', 'prick', 'pricks', 'schmuck', 'schlong', 'schlongs', 'putz', 'putzes', 'poon', 'poons', 'nookie', 'nooky',
  'skank', 'skanks', 'skanky', 'hooker', 'hookers', 'pimp', 'pimps', 'nazi', 'nazis', 'rape', 'raped', 'rapes', 'raping',
  'rapist', 'rapists', 'sex', 'sexy', 'sexed', 'sexes', 'sexier', 'sexiest', 'sexily', 'sexing', 'orgasm', 'orgasms', 'orgy',
  'orgies', 'pervert', 'perverts', 'smut', 'smuts', 'smutty', 'scrotum', 'scrota', 'scrotums', 'testicle', 'testicles', 'penile',
  'penis', 'penises', 'vagina', 'vaginas', 'vaginae', 'vulva', 'vulvae', 'vulvas', 'phallic', 'phallus', 'phalli', 'semen'];

const enable = fs.readFileSync(path.join(DATA, 'enable1.txt'), 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase());
const block = fs.readFileSync(path.join(DATA, 'blocklist-ldnoobw-en.txt'), 'utf8').split(/\r?\n/).map(s => s.trim().toLowerCase()).filter(s => /^[a-z]+$/.test(s));
const drop = new Set(HAND_WORDS);
for (const b of block) { drop.add(b); drop.add(b + 's'); drop.add(b + 'es'); }

const kept = [];
let dropped = 0;
for (const w of enable) {
  if (!/^[a-z]{2,15}$/.test(w)) continue;
  if (drop.has(w) || HAND_STEMS.some(s => w.startsWith(s))) { dropped++; continue; }
  kept.push(w);
}
kept.sort();
const uniq = kept.filter((w, i) => i === 0 || w !== kept[i - 1]);

let packed = '', prev = '';
for (const w of uniq) {
  let p = 0; while (p < prev.length && p < w.length && p < 25 && prev[p] === w[p]) p++;
  packed += String.fromCharCode(65 + p) + w.slice(p);
  prev = w;
}

const src = `// Word Weave's word list (made by game-waves/tools/word-weave-build-words.mjs, do not edit by hand).
// From ENABLE (public domain), minus the LDNOOBW English list (CC BY 4.0) and a small hand list; 2 to 15 letters.
// Packed: sorted words, each a capital letter (letters shared with the word before: A = 0, B = 1, ...) and then the rest.
export const COUNT = ${uniq.length};
export const PACKED = '${packed}';
`;
fs.writeFileSync(OUT, src);
console.log(`word-weave words: kept ${uniq.length}, dropped ${dropped} (blocklist + hand list), ${(src.length / 1024).toFixed(0)} KB -> ${path.relative(process.cwd(), OUT)}`);
