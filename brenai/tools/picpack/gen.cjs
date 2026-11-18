// Makes the picture pack: about a hundred pictures Wizra can send, drawn once and stored on the server.
//   node gen.cjs <outDir> [baseUrl] [password]     needs a running Brenai with her 3D model and motion clips loaded, and Playwright
// Photos of her are posed renders of her model (so they stay out of the repo, like the model); the rest are painted by paint.js.
// Each entry: file, theme, desc (what she is told the picture shows), where it can be sent from (home / out / any),
// scene (for selfies taken where she really is), min rapport, and path for the ones that belong to romance, friends or mentor.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
const [out, base = 'http://localhost:8096', pw = 'pw123'] = process.argv.slice(2);
const items = []; const add = (file, theme, desc, o) => items.push({ file: file + '.webp', theme, desc, where: 'any', min: 0, ...o });
// ---- painted: nature and architecture she photographs when she is out and about ----
const NATURE = { lake_sunset: 'the sun going down over a lake', forest_path: 'a path through pine woods', mountains: 'snowy mountains on a clear day', night_moon: 'a huge moon over the hills', autumn_park: 'a park bench under red and orange trees', rain_window: 'rain running down a window over the city',
  snow_field: 'snow coming down on a field of pines', beach: 'an empty beach', cherry_tree: 'a cherry tree in full bloom', flower_field: 'a field full of wildflowers', river: 'a river winding out of the mountains', campfire: 'a campfire at night in the woods', foggy_hills: 'fog sitting in the hills',
  aurora: 'the northern lights', crow_wire: 'three crows on a power line at sunset', pumpkins: 'a pumpkin patch', cemetery_dusk: 'an old cemetery at dusk, which she thinks is beautiful', mushrooms: 'red mushrooms on a forest floor', storm_coast: 'a storm rolling in over a lighthouse', stargazing: 'the night sky full of stars, with a shooting star' };
const ARCH = { cathedral: 'a gothic cathedral at dusk', campus_hall: 'the old brick hall on her campus', bridge_night: 'a suspension bridge lit up at night', skyline: 'the city skyline at sunset', old_library: 'the stacks of an old library', castle: 'a castle on a hill', row_houses: 'a row of painted town houses',
  clock_tower: 'a clock tower over the rooftops at dusk', lighthouse: 'a lighthouse with its beam on', subway: 'an empty subway platform', neon_alley: 'a rainy alley full of neon signs', market: 'an outdoor market with striped awnings', water_tower: 'a rooftop water tower at golden hour', stained_glass: 'a stained glass window', spiral_stairs: 'a spiral staircase seen from above', greenhouse: 'the inside of a greenhouse' };
for (const k in NATURE) add('n_' + k, 'nature', 'a photo she took of ' + NATURE[k], { paint: k });
for (const k in ARCH) add('a_' + k, 'architecture', 'a photo she took of ' + ARCH[k], { paint: k });
// ---- selfies where she really is (scene must match her real place, which is how a picture can give her away) ----
const SIGNW = { plain: 'a plain selfie', peace: 'a selfie throwing a peace sign', wave: 'a selfie with a little wave', heart: 'a selfie making a finger heart', fox: 'a selfie making a fox sign', full: 'a full-length picture of her outfit' };
const PLACEW = { classroom: 'in the back of a lecture hall', library: 'at a library table', cafe: 'behind the counter at work', gamestore: 'at the game store', bar: 'in a bar with coloured lights behind her', rooftop: 'on the fire escape at night', bedroom: 'in her dark bedroom, half asleep', car: 'sitting in her parked car', street: 'out on the street' };
const OUT = [['classroom', 'plain', 'neutral'], ['classroom', 'peace', 'playful'], ['library', 'plain', 'focused'], ['library', 'wave', 'happy'], ['cafe', 'plain', 'tired'], ['cafe', 'peace', 'happy'], ['gamestore', 'peace', 'excited'], ['gamestore', 'wave', 'joy'], ['gamestore', 'fox', 'playful'],
  ['bar', 'plain', 'tipsy'], ['bar', 'heart', 'tipsy'], ['bar', 'peace', 'tipsy'], ['rooftop', 'plain', 'high'], ['rooftop', 'fox', 'high'], ['bedroom', 'plain', 'tired'], ['car', 'plain', 'sad'], ['car', 'plain', 'neutral'], ['street', 'plain', 'chill'], ['street', 'peace', 'happy'], ['street', 'full', 'playful'], ['street', 'wave', 'happy']];
OUT.forEach(([scene, pose, face], i) => add(`s_${scene}_${pose}_${i}`, 'selfie', `${SIGNW[pose]} ${PLACEW[scene]}${face === 'tipsy' ? ', flushed and clearly a few drinks in' : face === 'high' ? ', red-eyed and grinning' : face === 'sad' ? ', looking like she has been crying' : ''}`, { where: 'out', scene, min: pose === 'heart' ? 60 : 0, shot: { pose, scene, face, blush: face === 'tipsy' ? 0.5 : 0 } }));
// ---- selfies and cute poses at home ----
const HOME = [['plain', 'playful', {}], ['plain', 'tired', {}], ['peace', 'happy', {}], ['wave', 'joy', {}], ['full', 'playful', {}], ['full', 'happy', { turn: 0.5 }], ['heart', 'happy', { min: 60 }], ['fox', 'playful', { min: 50 }]];
HOME.forEach(([pose, face, o], i) => add(`s_dorm_${pose}_${i}`, 'selfie', `${SIGNW[pose]} in her dorm room`, { where: 'home', min: o.min || 0, shot: { pose, scene: 'dorm', face, turn: o.turn } }));
const CUTE = [['bed', 'playful', 'lying on her front on her bed, one boot kicked up'], ['bed2', 'chill', 'lying back on her bed'], ['knees', 'neutral', 'sitting on the edge of her bed hugging her knees'], ['knee', 'happy', 'sitting on her bed with one knee pulled up'], ['hair', 'playful', 'sitting on her bed with a hand in her hair']];
CUTE.forEach(([pose, face, d], i) => add(`c_${pose}`, 'cute', `a picture of her ${d}`, { where: 'home', min: 30, shot: { pose, scene: 'dorm', face } }));
add('c_talk1', 'cute', 'a picture of her mid-rant in her room, hands going', { where: 'home', shot: { clip: 'talking', t: 1.2, cam: 'half', scene: 'dorm', face: 'excited' } });
add('c_talk2', 'cute', 'a picture of her shrugging at the camera in her room', { where: 'home', shot: { clip: 'talking', t: 3.4, cam: 'half', scene: 'dorm', face: 'playful' } });
add('c_jump', 'cute', 'a blurry picture of her jumping in her room, clearly thrilled about something', { where: 'home', min: 40, shot: { clip: 'jump', t: 0.75, cam: 'full', scene: 'dorm', face: 'joy' } });
add('c_texting', 'cute', 'a mirror picture of her pacing her room, texting', { where: 'home', shot: { clip: 'texting_and_walking', t: 1.0, cam: 'full', scene: 'dorm', face: 'focused', turn: 0.4 } });
add('c_idle_turn', 'cute', 'a picture of her looking back over her shoulder in her room', { where: 'home', min: 40, shot: { clip: 'idle', t: 5, cam: 'half', scene: 'dorm', face: 'playful', turn: 0.9 } });
// ---- her, out somewhere worth a picture (not tied to where she is right now: "from the other day") ----
const TRIPS = [['lake_sunset', 'peace', 'half', 'happy', 'by a lake at sunset'], ['cherry_tree', 'plain', 'face', 'happy', 'under a cherry tree in bloom'], ['beach', 'wave', 'half', 'joy', 'on an empty beach'], ['autumn_park', 'plain', 'half', 'chill', 'in the park in autumn'], ['snow_field', 'plain', 'face', 'happy', 'out in the snow'],
  ['cathedral', 'full', 'full', 'playful', 'in front of a gothic cathedral, delighted'], ['castle', 'peace', 'half', 'excited', 'in front of an actual castle'], ['skyline', 'plain', 'half', 'chill', 'with the city skyline behind her at sunset'], ['flower_field', 'full', 'full', 'happy', 'standing in a field of wildflowers'],
  ['stargazing', 'plain', 'face', 'chill', 'under a sky full of stars'], ['market', 'wave', 'half', 'happy', 'at an outdoor market'], ['cemetery_dusk', 'peace', 'half', 'playful', 'in an old cemetery at dusk, very pleased with herself'], ['pumpkins', 'fox', 'half', 'playful', 'in a pumpkin patch']];
TRIPS.forEach(([bg, pose, cam, face, d]) => add(`t_${bg}`, 'selfie', `a picture of her ${d}`, { where: 'any', min: 20, shot: { pose, cam, scene: 'custom', bg, face } }));
// ---- only for what you two are ----
add('r_kiss', 'relationship', 'a picture of her blowing a kiss at the camera, a little embarrassed about it', { path: 'romance', min: 70, where: 'home', shot: { clip: 'kiss', t: 3.0, cam: 'half', scene: 'dorm', face: 'blush', blush: 0.6 } });
add('r_heart_blush', 'relationship', 'a close selfie making a finger heart, blushing', { path: 'romance', min: 60, where: 'home', shot: { pose: 'heart', scene: 'dorm', face: 'blush', blush: 0.7 } });
add('r_bridge', 'relationship', 'a picture of her on a bridge at night making a heart, captioned for him', { path: 'romance', min: 60, shot: { pose: 'heart', cam: 'half', scene: 'custom', bg: 'bridge_night', face: 'happy', blush: 0.4, light: [0.8, 0.8, 1] } });
add('r_sunset', 'relationship', 'a picture of her at sunset, looking at the camera like she wishes he were there', { path: 'romance', min: 70, shot: { pose: 'plain', cam: 'face', scene: 'custom', bg: 'sunset_for_two', face: 'blush', blush: 0.5, light: [1, 0.85, 0.8] } });
for (const [k, d] of [['two_coffees', 'two coffees on a table: she got him one'], ['movie_tickets', 'two tickets to a midnight horror movie'], ['note_thinking', 'a handwritten note that says she saw something and thought of him'], ['sunset_for_two', 'an empty bench at sunset with room for one more']]) add('r_' + k, 'relationship', 'a picture of ' + d, { path: 'romance', min: 60, paint: k });
for (const [k, d] of [['nat20', 'a natural 20 she just rolled'], ['pizza_night', 'a pizza with exactly one slice left for him'], ['controllers', 'two game controllers: she wants a player two']]) add('r_' + k, 'relationship', 'a picture of ' + d, { path: 'friend', min: 40, paint: k });
add('r_fox_grin', 'relationship', 'a selfie making a fox sign and pulling a face at him', { path: 'friend', min: 40, where: 'home', shot: { pose: 'fox', scene: 'dorm', face: 'joy' } });
for (const [k, d] of [['essay_a', 'her essay back with an A on it, the one he helped her with'], ['study_desk', 'her desk four hours into studying'], ['grad_cap', 'graduation caps in the air: one semester to go']]) add('r_' + k, 'relationship', 'a picture of ' + d, { path: 'mentor', min: 40, paint: k });
add('r_library_study', 'relationship', 'a selfie in the library stacks, studying like he told her to', { path: 'mentor', min: 40, shot: { pose: 'peace', cam: 'half', scene: 'custom', bg: 'old_library', face: 'focused', light: [1, 0.92, 0.8] } });

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext({ viewport: { width: 430, height: 880 } }); await ctx.addInitScript(() => { window.WIZRA_STILL = true; });
  const p = await ctx.newPage(); p.on('pageerror', e => console.log('page error:', e.message));
  await p.goto(base); await p.fill('#pw', pw); await p.click('#loginForm button');
  await p.waitForFunction(() => document.querySelector('#stage canvas'), null, { timeout: 90000 }); await p.waitForTimeout(2500);
  await p.addScriptTag({ path: path.join(__dirname, 'paint.js') }); await p.evaluate(() => document.fonts.ready);
  let n = 0;
  for (const it of items) {
    const url = await p.evaluate(async it => {
      if (it.paint) { const c = document.createElement('canvas'); c.width = 480; c.height = 600; PAINT[it.paint](c.getContext('2d'), 480, 600); return c.toDataURL('image/webp', 0.9); }
      if (it.shot.bg) { const c = document.createElement('canvas'); c.width = 384; c.height = 704; PAINT[it.shot.bg](c.getContext('2d'), 384, 704); window.WIZRA_BG = c; }
      return await avatar.snapshot({ kind: 'selfie', id: 'x', ...it.shot });
    }, it);
    if (!url || url.length < 2000) { console.log('FAILED', it.file); continue; }
    fs.writeFileSync(path.join(out, it.file), Buffer.from(url.split(',')[1], 'base64')); n++;
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(items.map(({ paint, shot, ...keep }) => keep)));
  console.log(`made ${n} of ${items.length}`, JSON.stringify(items.reduce((a, i) => (a[i.theme] = (a[i.theme] || 0) + 1, a), {}))); await b.close();
})();
