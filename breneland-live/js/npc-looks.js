// Who the NPC Editor (public/editor/npcs.html) can dress, and how each one looks as built in. Plain data with no imports, so the
// editor, the game and the tests all read the same thing (lib/npc-look.js keeps the same ids and kinds on the server). The places
// that build these people take their look from here and ask lookOf / voiceOf / tagOf for what Andrew saved over it. With nothing
// saved, those hand back exactly what they were given.
//
// An entry: { name (never changes, timetables hash it), kind: 'human' | 'unicorn' | 'dog', group, where (a few words for the
// editor), look, voice, poses (extra poses the editor offers: the work they do) }. The dogs' looks live in dogs.js (DAX, NALA, MOLLY).

export const NPC_GROUPS = [['dogs', 'Dogs'], ['main', 'Main'], ['town', 'Town'], ['areas', 'Game areas'], ['unicorns', 'Unicorns']];

export const NPCS = {
  // ---- dogs (looks in dogs.js)
  dax: { name: 'Dax', kind: 'dog', group: 'dogs', where: 'Andrew\'s brindle lab' },
  nala: { name: 'Nala', kind: 'dog', group: 'dogs', where: 'Andrew\'s golden pit mix' },
  molly: { name: 'Molly', kind: 'dog', group: 'dogs', where: 'Joyce\'s older dog' },

  // ---- the main folk
  // Kevin, as in Andrew's photo: sixty-odd, a big toothy grin in a weathered face, grey-brown hair thin on top and feathered
  // back over the ears, grey stubble, a beige button-up over a white tee under a dark brown work jacket, work trousers and boots.
  kevin: {
    name: 'Kevin', kind: 'human', group: 'main', where: 'the pier and his boat', voice: { pitch: 95, rate: 0.72 },
    poses: ['fish', 'cast', 'reel', 'catch', 'drink', 'tiller', 'sweep'],
    look: {
      outfit: 'jacket', shirt: '#5a4230', inner: '#d8c5a2', pants: '#6b6452', shoes: '#4a3526', shoeKind: 'boots', hat: 'none',
      hairStyle: 'wavy', thin: true, hair: '#c2beb7', facialHair: 'stubble', facialHairColor: '#b5b0a8', browColor: '#8a847c', // a feathered 80s cut gone grey, thinning on top, tidy at the back
      faceShape: 'oval', skin: '#e3ae8b', eyes: 'dot', brows: 'soft', nose: 'round', mouth: 'toothy', blush: true, lines: true,
      build: 0.45, height: 0.74, accessory: 'rod',
    },
  },
  mabel: {
    name: 'Mabel', kind: 'human', group: 'main', where: 'the Fish Shack', voice: { pitch: 190, rate: 0.95 }, poses: ['talk', 'point'],
    look: { outfit: 'overalls', shirt: '#f2de8c', pants: '#2f6b4f', shoes: '#e0b54a', shoeKind: 'boots', hair: '#b8502e', hairStyle: 'bun', skin: '#e3ae8b', hat: 'straw', hatColor: '#d8c27a', body: 'f', shape: 0.8, height: 0.68, build: 0.55, mouth: 'grin', eyes: 'oval', blush: true },
  },
  pat: {
    name: 'Pat the Mail Carrier', kind: 'human', group: 'main', where: 'the mail round', voice: { pitch: 190, rate: 1.05 }, poses: ['point'],
    look: { shirt: '#3f6fb5', pants: '#2e3f66', hat: 'mailcap', hatColor: '#2e3f66', accessory: 'satchel', skin: '#7a4a2e', hair: '#1e1a18' },
  },
  pete: {
    name: 'Pepperoni Pete', kind: 'human', group: 'main', where: 'pizza in the evening', voice: { pitch: 150, rate: 1.25 }, poses: ['cheer'],
    look: { shirt: '#d9362b', pants: '#2e2e36', hat: 'cap', hatColor: '#d9362b', skin: '#e8b98f', hair: '#5a3622', shoes: '#f3efe6' },
  },
  joyce: {
    name: 'Joyce', kind: 'human', group: 'main', where: 'the Community Garden', voice: { pitch: 235, rate: 0.82, formant: 1.15 }, poses: ['garden', 'stretch'],
    look: { outfit: 'coat', shirt: '#b58fbf', inner: '#f3efe6', pants: '#6b6452', hat: 'sunhat', hatColor: '#e8d9a0', skin: '#e3ae8b', hair: '#e8e4de', hairStyle: 'bun', accessory: 'trowel', glasses: 'round', lines: true, height: 0.72, build: 0.55 },
  },
  lou: {
    name: 'Lou (out for a jog)', kind: 'human', group: 'main', where: 'jogging the street, dawn and evening', voice: null, poses: ['stretch'],
    look: { shirt: '#ff6b6b', pants: '#2e2e36', hat: 'cap', hatColor: '#ffffff', skin: '#c98e62', hair: '#2e2420' },
  },

  // Buddy and Carol, Andrew's parents (buddy-carol.js), from his photos (docs/refs/andrew-buddy-carol-*.webp, andrew-carol-3.png).
  // Buddy: tall and heavyset, broad shoulders, a round ruddy face, greying sandy hair swept up and untidy, a short grey goatee
  // and stubble, a grey zip-up fleece over a dark tee, jeans, brown shoes. Carol: shorter (her head at his shoulder), soft-built,
  // a blonde chin-length bob with a side part, wire-rim glasses, a big warm smile. Her outfit rotates by day (CAROL_OUTFITS).
  buddy: {
    name: 'Buddy', kind: 'human', group: 'main', where: 'his walk, the garage and Carol\'s booth', voice: { pitch: 108, rate: 0.95 },
    poses: ['sit', 'wave', 'talk', 'laugh', 'drink', 'read'],
    look: {
      outfit: 'jacket', shirt: '#7d8189', inner: '#2e2e36', pants: '#4a6a9a', shoes: '#6b4a2b', shoeKind: 'sneakers', hat: 'none',
      hairStyle: 'wavy', hair: '#b9a98c', facialHair: 'scruff', facialHairColor: '#aaa59d', browColor: '#8a7a62',
      faceShape: 'round', skin: '#f0bfa0', eyes: 'dot', brows: 'soft', nose: 'round', mouth: 'smile', blush: true, lines: true,
      body: 'm', shape: 0.12, build: 0.92, height: 1, shoulders: 1.12, scale: 1.1,
    },
  },
  carol: {
    name: 'Carol', kind: 'human', group: 'main', where: 'her wreath booth, the garage and the morning walk', voice: { pitch: 205, rate: 1.0, formant: 1.08 },
    poses: ['talk', 'wave', 'laugh', 'pet', 'point', 'read'],
    look: {
      outfit: 'tee', shirt: '#f0784f', pants: '#2e2e36', shoes: '#3a2f2a', shoeKind: 'sneakers', hat: 'none',
      hairStyle: 'bob', hair: '#e2c27a', browColor: '#b8975a', glasses: 'round',
      faceShape: 'round', skin: '#f6d3b3', eyes: 'happy', brows: 'soft', nose: 'small', mouth: 'toothy', blush: true,
      body: 'f', shape: 0.85, build: 0.62, height: 0.3, scale: 0.95,
    },
  },

  // ---- the town: the twelve residents (town-life.js, in this order), the game store's clerk and shoppers
  marge: { name: 'Marge', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 215, rate: 0.9 }, look: { shirt: '#c8b3e6', pants: '#3f3f4a', hair: '#e8e4de', hairStyle: 'bun', skin: '#e3ae8b', glasses: 'round', height: 0.7, shape: 0.9 } },
  dev: { name: 'Dev', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 125 }, look: { shirt: '#3f8fd9', pants: '#2e2e36', hair: '#1e1a18', hairStyle: 'short', skin: '#a86b45', height: 0.84 } },
  rosa: { name: 'Rosa', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 205, rate: 1.05 }, look: { shirt: '#e0463c', pants: '#6b5a44', hair: '#3a2a20', hairStyle: 'long', skin: '#c98e62', hat: 'sunhat', hatColor: '#f2de8c', height: 0.76, shape: 0.9 } },
  bert: { name: 'Bert', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 105, rate: 0.85 }, look: { shirt: '#f3efe6', pants: '#5b7fb5', hair: '#9f978e', hairStyle: 'balding', skin: '#f6d3b3', facialHair: 'mustache', height: 0.8, build: 0.7 } },
  kim: { name: 'Kim', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 195 }, look: { shirt: '#7ddc7a', pants: '#2e2e36', hair: '#2e2420', hairStyle: 'bob', skin: '#f6d3b3', height: 0.74, shape: 0.85 } },
  tomas: { name: 'Tomas', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 140, rate: 1.1 }, look: { shirt: '#ffb347', pants: '#3f5f8f', hair: '#4a3020', hairStyle: 'curly', skin: '#c98e62', hat: 'cap', hatColor: '#e0463c', height: 0.82 } },
  ada: { name: 'Ada', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 240, rate: 1.15 }, look: { shirt: '#ff8fb8', pants: '#f3efe6', hair: '#c9873a', hairStyle: 'pony', skin: '#f6d3b3', height: 0.66, shape: 0.9 } },
  walt: { name: 'Walt', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 98, rate: 0.8 }, look: { shirt: '#5a7f4a', pants: '#6b6452', hair: '#d8d8d8', hairStyle: 'side', skin: '#e3ae8b', facialHair: 'beard', height: 0.8, build: 0.6 } },
  nia: { name: 'Nia', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 200 }, look: { shirt: '#6b4a8f', pants: '#2e2e36', hair: '#1e1a18', hairStyle: 'afro', skin: '#7a4a2e', height: 0.78, shape: 0.9 } },
  gusjr: { name: 'Gus Jr', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 175, rate: 1.2 }, look: { shirt: '#2f6b4f', pants: '#8a6240', hair: '#8a5a3a', hairStyle: 'spiky', skin: '#f6d3b3', height: 0.72 } },
  lena: { name: 'Lena', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 210, rate: 0.95 }, look: { shirt: '#f2de8c', pants: '#3f3f4a', hair: '#e8b4c8', hairStyle: 'wavy', skin: '#e3ae8b', glasses: 'square', height: 0.75, shape: 0.9 } },
  otis: { name: 'Otis', kind: 'human', group: 'town', where: 'Maple Row and Summit Hill', voice: { pitch: 115 }, look: { shirt: '#9cc8e8', pants: '#5b6b86', hair: '#3a2a20', hairStyle: 'buzz', skin: '#a86b45', height: 0.86, build: 0.6 } },
  jonah: { name: 'Jonah', kind: 'human', group: 'town', where: 'shopping at the game store', voice: null, look: { shirt: '#5b7fb5', pants: '#2e2e36', hair: '#1e1a18', hairStyle: 'short', skin: '#a86b45', height: 0.78 + 0 * 0.04, shape: 0.2 } },
  pip: { name: 'Pip', kind: 'human', group: 'town', where: 'shopping at the game store', voice: null, look: { shirt: '#f0a58a', pants: '#2e2e36', hair: '#c9873a', hairStyle: 'long', skin: '#f6d3b3', height: 0.78 + 1 * 0.04, shape: 0.9 } },
  clem: { name: 'Clem', kind: 'human', group: 'town', where: 'behind the game store counter', voice: { pitch: 165 }, poses: ['talk', 'point'], look: { outfit: 'vest', shirt: '#2f6b4f', inner: '#f3efe6', pants: '#3f3f4a', hair: '#8a5a3a', hairStyle: 'side', skin: '#f6d3b3', glasses: 'round', height: 0.8 } },
  // the town bus: Bernie drives Route 7 every half hour, and the riders get off and on at the stop now and then
  bernie: { name: 'Bernie the Bus Driver', kind: 'human', group: 'town', where: 'driving the bus, Route 7', voice: { pitch: 118, rate: 0.95 }, poses: ['drive', 'wave'], look: { outfit: 'jacket', shirt: '#1f3d58', inner: '#f3efe6', pants: '#2e3f66', hat: 'mailcap', hatColor: '#1f3d58', skin: '#c98e62', hair: '#3a2a20', hairStyle: 'short', facialHair: 'mustache', tie: 'tie', tieColor: '#2f6b5f', height: 0.8, build: 0.65 } },
  ivy: { name: 'Ivy', kind: 'human', group: 'town', where: 'riding the bus', voice: { pitch: 215, rate: 1.05 }, look: { shirt: '#e88fb3', pants: '#3f3f4a', hair: '#2e2420', hairStyle: 'pony', skin: '#e3ae8b', accessory: 'backpack', height: 0.74, shape: 0.85 } },
  hank: { name: 'Hank', kind: 'human', group: 'town', where: 'riding the bus', voice: { pitch: 100, rate: 0.85 }, look: { outfit: 'coat', shirt: '#7a5a3a', inner: '#f3efe6', pants: '#4a4038', hat: 'flatcap', hatColor: '#5b5248', skin: '#f6d3b3', hair: '#d8d8d8', hairStyle: 'side', facialHair: 'beard', height: 0.78, build: 0.6 } },
  zoe: { name: 'Zoe', kind: 'human', group: 'town', where: 'riding the bus', voice: { pitch: 230, rate: 1.2 }, look: { outfit: 'hoodie', shirt: '#7ddc7a', pants: '#2e2e36', hair: '#c9873a', hairStyle: 'bob', skin: '#a86b45', accessory: 'headphones', height: 0.7, shape: 0.9 } },
  raj: { name: 'Raj', kind: 'human', group: 'town', where: 'riding the bus', voice: { pitch: 135, rate: 1.05 }, look: { shirt: '#9cc8e8', pants: '#3f5f8f', hair: '#1e1a18', hairStyle: 'short', skin: '#a86b45', accessory: 'satchel', glasses: 'square', height: 0.82 } },
  mae: { name: 'Mae', kind: 'human', group: 'town', where: 'riding the bus', voice: { pitch: 205, rate: 0.9 }, look: { outfit: 'coat', shirt: '#c8b3e6', inner: '#f3efe6', pants: '#6b6452', hat: 'sunhat', hatColor: '#f2de8c', skin: '#7a4a2e', hair: '#e8e4de', hairStyle: 'bun', height: 0.7, shape: 0.9 } },

  // ---- the game areas (areas.js, and the Arkham four in the Lovecraft house, lovecraft-house.js): the Arkham table, the unicorn
  // party, the picnic, and the spare table and campfire folk.
  // The Arkham four are drawn from the base game's investigators. The Detective is Joe Diamond (fedora, belted trench coat with the
  // collar up, tie, square stubbled jaw). The Professor is Harvey Walters (silver-white hair swept back, big white beard, round
  // spectacles, brown tweed suit, red tie, a book). The Reporter is Rex Murphy (slicked side-parted hair, wire glasses, curled
  // moustache and a little pointed beard, shirtsleeves and an olive waistcoat, notepad and pencil). The Cultist is the game's hooded
  // cultist (deep cowl, long dark robe with a cord belt, an amulet, a candle).
  detective: { name: 'Detective', kind: 'human', group: 'areas', where: 'the Arkham table, Lovecraft house', voice: { pitch: 105, rate: 0.9, style: 'gruff' }, poses: ['look', 'point'], look: { outfit: 'coat', trench: true, shirt: '#ece6d8', coat: '#a3875a', pants: '#34343c', shoeKind: 'dress', shoes: '#3a2a20', tie: 'tie', tieColor: '#6e2a2a', hat: 'fedora', hatColor: '#3f362e', accessory: 'lantern', skin: '#e8b98f', hair: '#2e2420', hairStyle: 'short', faceShape: 'square', eyes: 'dot', brows: 'thick', nose: 'long', mouth: 'flat', facialHair: 'stubble', blush: false, body: 'm', build: 0.5, height: 0.62, shoulders: 1.12, headSize: 0.94 } },
  professor: { name: 'Professor', kind: 'human', group: 'areas', where: 'the Arkham table, Lovecraft house', voice: { pitch: 125, rate: 0.8 }, poses: ['read', 'talk'], look: { outfit: 'suit', shirt: '#5e4b3a', inner: '#f3efe6', tie: 'tie', tieColor: '#a3282c', pants: '#4a4038', shoeKind: 'sneakers', shoes: '#3a2a20', glasses: 'round', accessory: 'book', hair: '#b4b9c2', hairStyle: 'wavy', facialHair: 'beard', facialHairColor: '#d6dae0', browColor: '#d6dae0', skin: '#ecb48e', faceShape: 'oval', eyes: 'sleepy', brows: 'thick', nose: 'round', mouth: 'flat', blush: true, lines: true, body: 'm', build: 0.45, height: 0.6 } },
  reporter: { name: 'Reporter', kind: 'human', group: 'areas', where: 'the Arkham table, Lovecraft house', voice: { pitch: 150, rate: 1.3 }, poses: ['talk', 'point'], look: { outfit: 'vest', shirt: '#6b6a3e', inner: '#f6f3ea', tie: 'none', pants: '#3f3f48', shoeKind: 'dress', shoes: '#4a3526', glasses: 'round', accessory: 'notepad', skin: '#c98e62', hair: '#5a3e28', hairStyle: 'side', faceShape: 'oval', eyes: 'dot', brows: 'arched', nose: 'long', mouth: 'smirk', facialHair: 'vandyke', blush: false, body: 'm', build: 0.3, height: 0.6 } },
  cultist: { name: 'Cultist', kind: 'human', group: 'areas', where: 'the Arkham table, Lovecraft house', voice: { pitch: 95, rate: 0.85, style: 'whisper' }, poses: ['whisper', 'look'], look: { outfit: 'gown', robe: true, shirt: '#3a2338', tieColor: '#9a2230', pants: '#241820', shoeKind: 'boots', shoes: '#1e1a1e', hat: 'hood', hatColor: '#3a2338', accessory: 'candle', skin: '#d8d4c8', hair: '#1e1a18', hairStyle: 'buzz', faceShape: 'oval', eyes: 'sleepy', brows: 'angry', nose: 'long', mouth: 'smirk', blush: false, body: 'm', build: 0.35, height: 0.6 } },
  // The Dungeon Master: Claude in the DM's chair at D&D night (dnd.js). The cultist's robe made into a warm old game master's (midnight
  // blue with gold, a book of notes), and his own head piece, the sage's hood (bodies-sage.js): a deep hood with a gold edge, the white
  // hair and the long white beard flowing out of it as one, the face open and friendly (the cultist's cowl has no face).
  dm: { name: 'DM: Claude', kind: 'human', group: 'areas', where: "the DM's chair at D&D night, the game store's back room", voice: { pitch: 100, rate: 0.9 }, poses: ['talk', 'point'], look: { outfit: 'gown', robe: true, shirt: '#26305e', tieColor: '#e3b04a', pants: '#1c2348', shoeKind: 'boots', shoes: '#2a1f18', hat: 'sagehood', hatColor: '#26305e', accessory: 'book', skin: '#eab08a', hair: '#f4f5f8', hairStyle: 'long', facialHair: 'longbeard', facialHairColor: '#fafbfd', browColor: '#f4f5f8', faceShape: 'oval', eyes: 'sleepy', brows: 'thick', nose: 'round', mouth: 'smile', blush: true, lines: true, body: 'm', build: 0.45, height: 0.62 } },
  partykid: { name: 'Party Kid', kind: 'human', group: 'areas', where: 'the Unstable Unicorns party', voice: { pitch: 330, rate: 1.35, formant: 1.25 }, poses: ['cheer', 'dance', 'pet'], look: { shirt: '#6fb8ff', pants: '#ff8fb8', hat: 'party', hatColor: '#b48cff', accessory: 'balloon', scale: 0.8, skin: '#c98e62', hair: '#2e2420', hairStyle: 'pony' } },
  priya: { name: 'Priya', kind: 'human', group: 'areas', where: 'the Picnic Lawn', voice: { pitch: 225, formant: 1.12 }, poses: ['talk', 'laugh'], look: { shirt: '#ffb347', pants: '#3f5f8f', hat: 'sunhat', hatColor: '#e0574f', skin: '#a86b45', hair: '#1e1a18', hairStyle: 'long' } },
  dale: { name: 'Dale', kind: 'human', group: 'areas', where: 'the Picnic Lawn', voice: { pitch: 120 }, poses: ['talk', 'laugh'], look: { shirt: '#7ddc7a', pants: '#6b5a44', hat: 'cap', hatColor: '#3f8fd9', skin: '#f6d3b3', hair: '#c9873a' } },
  sam: { name: 'Sam', kind: 'human', group: 'areas', where: 'a game table with no theme (spare)', voice: { pitch: 140 }, poses: ['talk', 'highfive'], look: { shirt: '#7ddc7a', pants: '#3f5f8f', hat: 'cap', hatColor: '#e0574f' } },
  riley: { name: 'Riley', kind: 'human', group: 'areas', where: 'a game table with no theme (spare)', voice: { pitch: 215, formant: 1.1 }, poses: ['talk', 'highfive'], look: { shirt: '#ffb347', pants: '#55555f', hairStyle: 'long', hair: '#8a4b2a' } },
  jo: { name: 'Jo', kind: 'human', group: 'areas', where: 'a game table with no theme (spare)', voice: { pitch: 170 }, poses: ['talk', 'highfive'], look: { shirt: '#b48cff', pants: '#2e2e36', hat: 'beanie', hatColor: '#6fb8ff', skin: '#a86b45' } },
  remy: { name: 'Scout Remy', kind: 'human', group: 'areas', where: 'the campfire spot (spare)', voice: { pitch: 180, rate: 1.1 }, poses: ['warm'], look: { shirt: '#5a7f4a', pants: '#6b5a44', hat: 'beanie', hatColor: '#e0574f', skin: '#7a4a2e', hair: '#1e1a18' } },

  // ---- the unicorns at the party
  sprinkles: { name: 'Sprinkles', kind: 'unicorn', group: 'unicorns', where: 'the Unstable Unicorns party', voice: { style: 'neigh', pitch: 1.1 }, look: { color: '#ffc6e0', mane: ['#ff6b6b', '#ffb347', '#fff27a', '#b48cff'] } },
  moonpie: { name: 'Moonpie', kind: 'unicorn', group: 'unicorns', where: 'the Unstable Unicorns party', voice: { style: 'neigh', pitch: 0.95 }, look: { color: '#d9c6ff', mane: ['#6fb8ff', '#b48cff', '#ffffff', '#ff8fb8'], build: 'chunky' } },
  clover: { name: 'Clover', kind: 'unicorn', group: 'unicorns', where: 'the Unstable Unicorns party', voice: { style: 'neigh', pitch: 1.2 }, look: { color: '#c6f5e0', mane: ['#7ddc7a', '#fff27a', '#6fb8ff', '#ffffff'] } },
  noodle: { name: 'Noodle', kind: 'unicorn', group: 'unicorns', where: 'the Unstable Unicorns party', voice: { style: 'neigh', pitch: 1.3 }, look: { color: '#c9e6ff', mane: ['#ff8fb8', '#b48cff', '#ffffff', '#6fb8ff'], build: 'lean' } },
  bean: { name: 'Bean', kind: 'unicorn', group: 'unicorns', where: 'the Unstable Unicorns party', voice: { style: 'neigh', pitch: 1.5 }, look: { color: '#ffe0b8', mane: ['#ff8fb8', '#b48cff', '#6fb8ff'], build: 'foal' } },
};

// Carol's outfits, one a day in turn (buddy-carol.js lays the day's over her look; what the NPC Editor saved still wins):
// the coral floral top with dark trousers, the red tee with denim shorts and white sneakers, the grey hoodie with dark trousers.
export const CAROL_OUTFITS = [
  { outfit: 'tee', shirt: '#f0784f', pants: '#2e2e36', bottoms: 'pants', shoes: '#3a2f2a', floral: true },
  { outfit: 'tee', shirt: '#d9362b', pants: '#5b7fb5', bottoms: 'shorts', shoes: '#f3efe6', shoeKind: 'sneakers' },
  { outfit: 'hoodie', shirt: '#8a8f96', pants: '#2e2e36', bottoms: 'pants', shoes: '#3a2f2a' },
];

// The town-life residents in timetable order (their index decides who takes a night walk: never reorder).
export const TOWN_RESIDENTS = ['marge', 'dev', 'rosa', 'bert', 'kim', 'tomas', 'ada', 'walt', 'nia', 'gusjr', 'lena', 'otis'];

// An areas.js npc spec for one of them: { npc, name, voice, kind, look } (add seat etc. on top).
export const npcSpec = id => { const e = NPCS[id]; return { npc: id, name: e.name, voice: e.voice, kind: e.kind, look: e.look }; };

// ------------------------------------------------------------------ what Andrew saved (lib/npc-look.js), merged over the built-ins

// id -> the saved entry as the server cleaned it ({ ...look keys, tag?, voicePitch?, voiceRate? }); empty = nothing saved
const SAVED = new Map();
const EXTRA = ['tag', 'voicePitch', 'voiceRate'];   // saved with a person but not part of the look
export function setSavedLooks(looks) {
  SAVED.clear();
  if (!looks || typeof looks !== 'object') return;
  for (const [id, v] of Object.entries(looks)) if (v && typeof v === 'object' && NPCS[id] && NPCS[id].kind !== 'dog') SAVED.set(id, v);
}
export const savedLook = id => SAVED.get(id) || null;

// The look the game builds: the built-in one when nothing is saved (the very same object), else the saved keys over it.
// (lookOf also fills in the person's eye style, NPC_EYE_STYLES, when the look has none.)
// A saved 'none' held thing means no held thing; a saved null colour means "back to the automatic colour".
export function mergeLook(builtin, saved) {
  if (!saved) return builtin;
  const out = { ...builtin };
  for (const [k, v] of Object.entries(saved)) {
    if (EXTRA.includes(k) || k === 'name') continue;
    if (v === null) delete out[k];
    else out[k] = Array.isArray(v) ? v.slice() : v;
  }
  if (out.accessory === 'none') out.accessory = null;
  return out;
}
// Every person NPC's eye style (bodies-eyes.js EYE_STYLES). Most have `hooded`, the few who had the printed eyes keep `button`.
// It only fills in a look with no eyeStyle, so a style saved in the NPC Editor wins. Players' avatars are never touched.
export const NPC_EYE_STYLES = {
  kevin: 'hooded', mabel: 'hooded', pat: 'hooded', pete: 'hooded', joyce: 'hooded', lou: 'hooded', buddy: 'hooded', carol: 'button',
  marge: 'hooded', dev: 'hooded', rosa: 'hooded', bert: 'button', kim: 'hooded', tomas: 'hooded', ada: 'hooded', walt: 'hooded',
  nia: 'hooded', gusjr: 'button', lena: 'hooded', otis: 'hooded', jonah: 'hooded', pip: 'hooded', clem: 'hooded',
  bernie: 'hooded', ivy: 'hooded', hank: 'button', zoe: 'hooded', raj: 'hooded', mae: 'button',
  detective: 'hooded', professor: 'hooded', reporter: 'hooded', cultist: 'button', dm: 'hooded',
  partykid: 'hooded', priya: 'hooded', dale: 'hooded', sam: 'hooded', riley: 'hooded', jo: 'hooded', remy: 'hooded',
};
for (const [id, st] of Object.entries(NPC_EYE_STYLES)) { const n = NPCS[id]; if (n && n.kind === 'human' && n.look && n.look.eyeStyle === undefined) n.look.eyeStyle = st; }
export const lookOf = (id, builtin) => {
  const m = mergeLook(builtin, id ? SAVED.get(id) : null);
  return id && NPC_EYE_STYLES[id] && m && m.eyeStyle === undefined ? { ...m, eyeStyle: NPC_EYE_STYLES[id] } : m;
};
// The voice: the saved pitch and rate over the built-in voice (a new object only when something is saved).
export function voiceOf(id, builtin) {
  const s = id ? SAVED.get(id) : null;
  if (!s || (s.voicePitch === undefined && s.voiceRate === undefined)) return builtin;
  const v = { ...(builtin || {}) };
  if (s.voicePitch !== undefined) v.pitch = s.voicePitch;
  if (s.voiceRate !== undefined) v.rate = s.voiceRate;
  return v;
}
// The name tag's words (the person's own name is never changed: timetables hash it).
export function tagOf(id, name) { const s = id ? SAVED.get(id) : null; return s && typeof s.tag === 'string' && s.tag.trim() ? s.tag.trim() : name; }

// Ask the server for the editor's saved looks (GET /api/npc-look) and keep them for lookOf & co. Called by main.js before
// anyone is built; returns every saved look by id (the dogs' too, for dogs.js applySavedLooks). Nothing saved, no server
// or no answer within a moment = everyone as built in.
export async function loadNpcLooks(timeoutMs = 2500) {
  try {
    const ac = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ac && setTimeout(() => ac.abort(), timeoutMs);
    const r = await fetch('/api/npc-look', { cache: 'no-store', signal: ac ? ac.signal : undefined });
    if (timer) clearTimeout(timer);
    if (!r.ok) return null;
    const j = await r.json();
    setSavedLooks(j.looks);
    return j.looks || null;
  } catch { return null; }
}
