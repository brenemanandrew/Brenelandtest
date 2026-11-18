// Wizra's avatar: a small animated SVG puppet. No libraries.
//
// The page only talks to it through this interface, so the real VTuber avatar can replace it later by providing the
// same five calls:
//   const av = WizraAvatar.mount(stageElement)
//   av.setMood(name)       base mood: auto, happy, playful, chill, focused, excited, tired, grumpy, sad, anxious
//   av.setThinking(bool)   she is working on a reply
//   av.talk(level)         call while she is speaking; level 0..1 is how loud her voice is right now (optional)
//   av.feel(text)          her reply so far: picks a passing expression from her words and actions
//   av.setRenderer(r)    swap what draws her, live (the cartoon below, or the 3D model from avatar-vrm.js)
//   mount(el, { onTouch(kind) })  onTouch fires when she is touched directly (the page passes it on to her, silently)
//   av.act(text)           her finished reply: plays the first gesture found in her actions (wave, nod, shrug, stretch...)
//   av.react(kind, dir)    something was done to her: poke, boop, pat, pet, swat, body, spam, wave, laugh, stare, gift
// Touch on the avatar itself (tap, stroke, swipe) is handled in here and calls react().
(function () {
  const SKIN = '#f4ecef', HAIR = '#0b0b10', INK = '#111', LIP = '#4a1f3a';
  const MARKUP = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" style="display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none">
  <defs><radialGradient id="wzbg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#8a5bb8"/><stop offset="1" stop-color="#2a1b4d"/></radialGradient></defs>
  <rect width="200" height="200" fill="url(#wzbg)"/>
  <g data-p="hairBack"><path d="M38 114 C30 28 170 28 162 114 L170 204 L30 204 Z" fill="${HAIR}"/></g>
  <g data-p="body">
    <rect x="88" y="118" width="24" height="34" fill="#e6dbe0"/>
    <rect x="87" y="136" width="26" height="6" rx="2" fill="${INK}"/><circle cx="100" cy="144" r="3" fill="#8a7aa0"/>
    <path d="M28 204 C32 162 60 148 100 148 C140 148 168 162 172 204 Z" fill="#2a2234"/>
    <path d="M70 152 C80 172 120 172 130 152" fill="none" stroke="#3d3249" stroke-width="5"/>
    <line x1="88" y1="162" x2="86" y2="190" stroke="#b9b2c4" stroke-width="2"/><line x1="112" y1="162" x2="114" y2="190" stroke="#b9b2c4" stroke-width="2"/>
  </g>
  <g data-p="head">
    <ellipse cx="100" cy="96" rx="34" ry="40" fill="${SKIN}"/>
    <ellipse data-p="blushL" cx="79" cy="110" rx="8" ry="4.5" fill="#e8798e" opacity="0"/><ellipse data-p="blushR" cx="121" cy="110" rx="8" ry="4.5" fill="#e8798e" opacity="0"/>
    <path d="M100 103 L98 111 L101 111" fill="none" stroke="#d8c8cf" stroke-width="1.5"/>
    <g data-p="eyeL"><ellipse data-p="irisL" cx="87" cy="100" rx="3.8" ry="4.2" fill="#3b2f4f"/><circle data-p="glintL" cx="88.3" cy="98.6" r="1.1" fill="#fff"/><path data-p="lidL" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    <g data-p="eyeR"><ellipse data-p="irisR" cx="113" cy="100" rx="3.8" ry="4.2" fill="#3b2f4f"/><circle data-p="glintR" cx="114.3" cy="98.6" r="1.1" fill="#fff"/><path data-p="lidR" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>
    <path data-p="browL" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/><path data-p="browR" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
    <path data-p="mouth" fill="${LIP}" stroke="${LIP}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- front hair: a full cap over the top of the head (no skin showing above the fringe), a choppy fringe, two side locks -->
    <path d="M61 104 C52 30 148 30 139 104 C137 90 131 81 121 77 L115 84 L108 76 L100 84 L92 76 L85 84 L79 77 C69 81 63 90 61 104 Z" fill="${HAIR}"/>
    <path d="M62 96 L57 138 L70 132 Z" fill="${HAIR}"/><path d="M138 96 L143 138 L130 132 Z" fill="${HAIR}"/>
  </g>
</svg>`;

  // ---- face shapes ----
  const LID = {
    open: x => `M${x - 7} 99 Q${x} 92 ${x + 7} 99`, wide: x => `M${x - 7} 98 Q${x} 89 ${x + 7} 98`, half: x => `M${x - 7} 99 Q${x} 96.5 ${x + 7} 99`,
    shut: x => `M${x - 7} 100 Q${x} 103 ${x + 7} 100`, smile: x => `M${x - 7} 101 Q${x} 94 ${x + 7} 101`,
    squintL: x => `M${x - 6} 95 L${x + 5} 100 L${x - 6} 105`, squintR: x => `M${x + 6} 95 L${x - 5} 100 L${x + 6} 105`,
    dizzy: x => `M${x - 5} 95 L${x + 5} 105 M${x + 5} 95 L${x - 5} 105`,
  };
  const BROW = { // [left, right]
    flat: ['M80 88 L94 87', 'M106 87 L120 88'], angry: ['M80 84 L94 90', 'M106 90 L120 84'], sad: ['M80 90 L94 85', 'M106 85 L120 90'],
    up: ['M80 84 L94 83', 'M106 83 L120 84'], cocked: ['M80 88 L94 87', 'M106 82 L120 84'],
  };
  const MOUTH = {
    flat: 'M92 120 Q100 116 108 120 Q100 125 92 120 Z', smile: 'M90 118 Q100 128 110 118 Q100 122 90 118 Z', grin: 'M89 117 Q100 133 111 117 Z',
    frown: 'M92 124 Q100 116 108 124 Q100 120 92 124 Z', o: 'M96 121 a4 5 0 1 0 8 0 a4 5 0 1 0 -8 0 Z', smirk: 'M92 121 Q101 125 110 116 Q101 121 92 121 Z',
    pout: 'M95 121 Q100 116 105 121 Q100 125 95 121 Z', wavy: 'M92 121 q4 -4 8 0 t8 0', talk: 'M94 119 Q100 128 106 119 Q100 117 94 119 Z', talk2: 'M96 120 a4 3 0 1 0 8 0 a4 3 0 1 0 -8 0 Z',
  };
  // an expression: lids, brows, mouth, blush 0..1, where the eyes rest (gx, gy), head pose (tilt deg, drop px)
  const FACE = {
    tipsy: { lid: 'half', brow: 'up', mouth: 'smile', blush: 0.9, tilt: 5 }, high: { lid: 'half', brow: 'flat', mouth: 'smile', tilt: -3, gy: -0.5 },
    neutral: { lid: 'open', brow: 'flat', mouth: 'flat' }, happy: { lid: 'open', brow: 'up', mouth: 'smile' }, playful: { lid: 'open', brow: 'cocked', mouth: 'smirk', tilt: 4 },
    chill: { lid: 'half', brow: 'flat', mouth: 'flat', tilt: -3 }, focused: { lid: 'half', brow: 'angry', mouth: 'flat', gy: 1.5 }, excited: { lid: 'wide', brow: 'up', mouth: 'grin' },
    tired: { lid: 'half', brow: 'sad', mouth: 'pout', tilt: 5, drop: 3, gy: 1.5 }, grumpy: { lid: 'half', brow: 'angry', mouth: 'frown' }, sad: { lid: 'open', brow: 'sad', mouth: 'frown', drop: 2, gy: 2 },
    anxious: { lid: 'wide', brow: 'sad', mouth: 'wavy' }, joy: { lid: 'smile', brow: 'up', mouth: 'grin', blush: 0.5 }, blush: { lid: 'open', brow: 'sad', mouth: 'pout', blush: 1, gx: 2.5, gy: 1.5 },
    surprised: { lid: 'wide', brow: 'up', mouth: 'o' }, flinch: { lid: 'squint', brow: 'sad', mouth: 'wavy' }, dizzy: { lid: 'dizzy', brow: 'sad', mouth: 'o' },
    angry: { lid: 'open', brow: 'angry', mouth: 'frown', blush: 0.4 }, eyeroll: { lid: 'half', brow: 'cocked', mouth: 'flat', gy: -3 }, thinking: { lid: 'open', brow: 'cocked', mouth: 'pout', gx: 2.5, gy: -2.5 },
    suspicious: { lid: 'half', brow: 'cocked', mouth: 'flat', gx: -2.5 },
  };
  // her words and actions -> a passing expression (first match wins)
  const FEEL = [
    [/roll(s|ed|ing)? her eyes|eye ?roll/i, 'eyeroll'], [/blush|fluster|embarrass|looks away|hides her face/i, 'blush'], [/gasp|jaw drops|eyes widen|wait,? what|what\?!|\?!/i, 'surprised'],
    [/glare|scowl|annoyed|huff|scoff|crosses her arms|ugh\b/i, 'grumpy'], [/laugh|giggl|snort|cackl|haha|lmao|\blol\b/i, 'joy'], [/smirk|wink|teas|grin/i, 'playful'],
    [/smil|beam|\bnice\b|love (it|that)|thank/i, 'happy'], [/yawn|sleepy|exhausted|so tired/i, 'tired'], [/frown|sigh|sorry|\bsad\b|tear/i, 'sad'],
    [/nervous|fidget|bites her lip|\bum+\b|\buh+\b/i, 'anxious'], [/squint|narrow(s|ed)? her eyes|suspicious|side-?eye/i, 'suspicious'], [/!!|omg|oh my god|no way|yes!/i, 'excited'], [/hmm+|thinks|ponder|considers/i, 'thinking'],
  ];

  // ---- the cartoon renderer. A renderer draws the state the controller hands it and says where a touch landed. ----
  // locate() answers in "puppet space": a 200 x 200 square with the face centre at (100,100), the nose at (100,108),
  // hair above y 80 and the body below y 150. Any other renderer maps its own picture onto the same square.
  function puppet(stage) {
    const wrap = document.createElement('div'); wrap.style.cssText = 'width:100%;height:100%'; wrap.innerHTML = MARKUP; stage.appendChild(wrap);
    const svg = wrap.firstElementChild, P = {}; let shown = '';
    svg.querySelectorAll('[data-p]').forEach(n => { P[n.dataset.p] = n; });
    return {
      locate(e) { const r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * 200, y: (e.clientY - r.top) / r.height * 200 }; },
      dispose() { wrap.remove(); },
      presence(mode) { wrap.style.visibility = mode === 'gone' || mode === 'leave' ? 'hidden' : 'visible'; },
      call(on) { wrap.style.visibility = on ? 'visible' : 'hidden'; },
      thumb(cb) { cb('data:image/svg+xml,' + encodeURIComponent(svg.outerHTML)); }, // a still of her as she is drawn right now
      draw({ face, lid, mouth, look, rot, tx, ty, sq, breathe }) {
        const key = lid + face.brow + mouth;
        if (key !== shown) {
          shown = key;
          P.lidL.setAttribute('d', (LID[lid] || LID[lid + 'L'])(87)); P.lidR.setAttribute('d', (LID[lid] || LID[lid + 'R'])(113));
          const eyes = ['open', 'wide', 'half'].includes(lid) ? '' : 'none';
          for (const n of ['irisL', 'irisR', 'glintL', 'glintR']) P[n].style.display = eyes;
          P.browL.setAttribute('d', BROW[face.brow][0]); P.browR.setAttribute('d', BROW[face.brow][1]);
          P.mouth.setAttribute('d', MOUTH[mouth]); P.mouth.setAttribute('fill', mouth === 'wavy' ? 'none' : LIP);
        }
        for (const [n, cx] of [['L', 87], ['R', 113]]) {
          P['iris' + n].setAttribute('cx', cx + look.x); P['iris' + n].setAttribute('cy', 100 + look.y); P['iris' + n].setAttribute('ry', lid === 'half' ? 3 : 4.2);
          P['glint' + n].setAttribute('cx', cx + 1.3 + look.x); P['glint' + n].setAttribute('cy', 98.6 + look.y);
        }
        const blush = face.blush || 0; P.blushL.setAttribute('opacity', blush); P.blushR.setAttribute('opacity', blush);
        // head: springs + pose + breathing; the back hair lags behind for a little sway
        P.head.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${rot.toFixed(2)} 100 140) translate(0 ${(140 * (1 - sq)).toFixed(2)}) scale(1 ${sq.toFixed(3)})`);
        P.hairBack.setAttribute('transform', `translate(${(tx * 0.5).toFixed(2)} ${(ty * 0.5).toFixed(2)}) rotate(${(rot * 0.45).toFixed(2)} 100 140)`);
        P.body.setAttribute('transform', `translate(0 ${(200 * -0.006 * breathe).toFixed(2)}) scale(1 ${(1 + 0.006 * breathe).toFixed(4)})`);
      },
    };
  }

  // ---- the controller: moods, passing expressions, touch, her reserve, the springs. The same for every renderer. ----
  // things she physically does, read from the actions in her reply: [pattern, gesture, seconds]
  const GEST = [
    [/rolls? her eyes|eye[- ]?roll/i, 'eyeroll', 3.2], [/chuckl|snicker|soft laugh|laughs? (softly|quietly|under her breath)|huffs? a laugh/i, 'chuckle', 3.4], [/\bclap/i, 'clap', 4], [/face ?palm|buries her face in her hand|hand over her (face|eyes)|pinches the bridge of her nose/i, 'facepalm', 4.5],
    [/taps? her chin|strokes? her chin|hand (on|to) her chin|thinks? (about|for|it over)|ponders?|considers? (it|this|that|him|you)|mulls?|thoughtful/i, 'think', 5], [/cross(es|ed|ing)? her arms|folds? her arms|arms crossed|arms folded/i, 'crossarms', 6], [/hands? on her hips?|plants? her hands/i, 'hips', 5],
    [/cheers?\b|throws? (up )?her (hands|arms)|fist pump|pumps? (a|her) fist|arms? in the air|whoops?/i, 'cheer', 3.6], [/pouts?|sulks?|puffs? (out )?her cheeks/i, 'pout', 5],
    [/finger heart|heart with her (fingers|thumb)|(tiny|little|small) heart/i, 'fingerheart', 3.2], [/peace sign|throws? (up )?(a |the )?(peace|deuces)|\bv[- ]sign|victory sign/i, 'peace', 3], [/ok(ay)? (sign|gesture|hand)|\ba-ok\b/i, 'oksign', 2.8],
    [/fox (sign|hand|gesture|ears)|makes? a (little )?fox/i, 'fox', 3], [/cross(es|ed|ing)? her fingers|fingers crossed/i, 'crossed', 3], [/flips? (him|you|it|that) off|(gives?|shows?) (him|you) the (middle )?finger|middle finger|flips? the bird/i, 'flipoff', 2.6],
    [/(wiggl|waggl)(es|ing)? her fingers|finger wave|(little|tiny) wave/i, 'fingerwave', 3],
    [/\bwav(e|es|ed|ing)\b|raises? a hand|lifts? a hand|holds up a hand|high[- ]fiv/i, 'wave', 2.6], [/\bnod(s|ded|ding)?\b/i, 'nod', 1.5],
    [/shak(es|ing) her head/i, 'shake', 1.7], [/\bshrug/i, 'shrug', 1.8], [/\byawn/i, 'yawn', 3], [/\bstretch/i, 'stretch', 3.2],
    [/\bbows?\b|dips her head/i, 'bow', 2], [/lean(s|ed|ing)? (in|forward|closer)|sits? forward|scoots? (closer|forward)/i, 'lean', 3], [/lean(s|ed|ing)? back|sinks? (back|into)|settles? (back|into)|reclin/i, 'leanback', 3],
    [/sits? up|straightens?( up)?|perks? up/i, 'situp', 2.6], [/slump|deflat|droops?|sags?/i, 'slump', 3],
    [/wiggl|kick(s|ing)? her (feet|foot|boots?)|taps? her (foot|boot)|swing(s|ing)? her (feet|legs)|bounces her (foot|leg)/i, 'feet', 2.8], [/shift(s|ed|ing)? in her (seat|chair)|squirms?|fidget/i, 'shift', 3],
    [/tilt(s|ed|ing)? her head|cock(s|ed)? her head/i, 'tilt', 2.2], [/headbang|bangs her head|bobs her head/i, 'headbang', 2.6], [/flips? her hair|toss(es)? her hair|hair flip/i, 'flip', 1.6],
    [/looks? away|glances? away|turns? away|averts?|looks? (off )?to the side/i, 'lookaway', 2.6], [/looks? down|stares? at (her|the) (lap|boots|floor|table)|hangs her head/i, 'lookdown', 2.4], [/looks? up|stares? at the ceiling|rolls her eyes/i, 'lookup', 1.8],
    [/laugh|giggl|snicker|cackl|snort|chuckl/i, 'laugh', 2.2], [/\bsigh|exhales|huffs?/i, 'sigh', 2.2], [/bounc(es|ing)|bops|hops in her seat/i, 'bounce', 2], [/\bdanc|sways? to|grooves?|shimm/i, 'dance', 3.5],
    [/cring|winc|recoil|shudder|shrinks? back/i, 'cringe', 2], [/jumps? (up|for joy|up and down|in excitement)|hops? up/i, 'jump', 1.6], [/blows? (him |you )?a kiss|kiss(es|ed)? (him|his|you|your)|gives? (him|you) a (quick |soft |little )?kiss/i, 'kiss', 6.5], [/jumps?|startl|flinch|jolts?/i, 'jolt', 1.4],
  ];
  // bigger things she does, also read from her actions: these change what she is busy with (see the routine in avatar-vrm.js)
  const ROUTINE = [
    [/(puts?|returns?|slides?|places?|tucks?) (her |the |that )?(book|novel|tome) (back|away)|back on(to)? the (book ?)?shelf/i, 'returnbook'],
    [/book ?shelf|\bshel(f|ves)\b|(gets?|grabs?|fetch(es)?|finds?|picks? out|retrieves?|brings? (back|over)|comes? back with|goes? (to get|for|and gets?|to grab|to find)|looks? for) (him |you |herself )?(a |her |the |another |that |some |one of her )?(new |different |good )?(book|novel|tome|rulebook)/i, 'fetchbook'],
    [/(gets?|grabs?|fetch(es)?|makes?|pours?|refills?|brews?|tops? (up|off)|goes? (to get|for|to make)) (him |you |herself )?(a |an |her |the |another |some |more )?(fresh |new |hot )?(coffee|drink|tea|mug|cup|energy drink|water|refill|cocoa)|\bkettle\b|coffee ?maker|\bcounter\b|kitchen/i, 'fetchdrink'],
    [/hugs? (one|a) knee|rests? her chin on her knee|pulls? (one|a) (knee|leg) up/i, 'knee'], [/curls? up|hugs? her knees|pulls? her (knees|legs) (up|in|to her chest)|tucks? her (legs|feet) (up|under)/i, 'curl'], [/(plays?|fiddles?|toys?) with her hair|runs? (a hand|her fingers) through her hair|twirls? (a strand|a lock|her hair)/i, 'hair'],
    [/(drapes?|swings?|throws?|hooks?|kicks?) her legs over|sits? sideways|sideways in (her|the) (chair|seat|armchair)/i, 'drape'],
    [/cross(es|ed|ing)? her (legs|ankles|feet|boots)/i, 'crosslegs'], [/(puts?|sets?|plants?|drops?|swings?) her (feet|boots) (back )?(down|on(to)? the floor|off the table)|feet off the table/i, 'feetdown'], [/(puts?|props?|kicks?|swings?) her (feet|boots) (back )?up/i, 'feetup'],
    [/\byoga\b|tree pose|warrior pose|sun salutation|does? (some |a few |her )?(stretches|poses)|rolls? out (her|a|the) (yoga )?mat|meditat/i, 'yoga'],
    [/(lies?|lays?|flops?|sprawls?|stretches) (back |down |out )*(on|onto|across) (her|the) bed|climbs? (on|onto|into) (her|the) bed/i, 'liedown'],
    [/(sits?|flops?|settles?|curls? up|plops?|drops?|sinks?|lies?|lays?|stretches?|sprawls?) (back |down |out )*(on|onto|in|into|across) (the|a|her|his|one of the) (bean ?bags?|log|camp chair|sofa|couch|picnic blanket|blanket|sleeping bag|blanket fort|fort|stool)/i, 'perch'],
    [/sits? (back )?down|flops? (back )?(down|into|onto)|(drops?|sinks?|settles?|plops?) (back )?(down )?(into|onto|in) (her|the) (chair|seat|armchair)|returns? to her (chair|seat)/i, 'sit'],
    [/gets? up|stands? up|gets? to her feet|rises? (from|to)|\bpac(es|ing)\b|walks? (around|over|off|away|across)|wanders?|strolls?/i, 'pace'],
    [/(puts?|sets?|tosses?|lays?) (down )?(her |the )?(book|phone)|closes? (her|the) book|pockets? her phone/i, 'sit'],
    [/(picks? up|grabs?|opens?|reads?|reading|flips? through|goes back to|returns? to|buries herself in) (her |the |a )?(book|novel|notes|tome|rulebook)|turns? (a|the) page/i, 'read'],
    [/(checks?|grabs?|picks? up|pulls? out|scrolls?|looks? at|glances? at|taps? (at|on)|types? on) (through )?(her |the )?phone|\bscroll(s|ing)?\b|\btexts?\b/i, 'phone'],
    [/\bsips?\b|takes? a (sip|drink|swig|gulp)|drinks?|picks? up her (mug|cup|coffee|drink)/i, 'sip'],
  ];
  // what she drifts into on her own when nothing is happening, and how she physically takes a touch
  const IDLE = [['shift', 3], ['feet', 2.4], ['tilt', 2], ['sigh', 2.2], ['flip', 1.6], ['stretch', 3.2], ['leanback', 3], ['think', 3]];   // on her own she fidgets, but she stays facing you
  const IDLE_SHY = [...IDLE, ['lookaway', 2.4], ['lookdown', 2], ['lookaway', 2.4]];                                                              // shy, flustered or low: her eyes slide off you now and then
  // how she is for the hour after she comes back from somewhere, when it shows: [resting face, what she keeps doing]
  const STATE = { cagey: ['anxious', [['lookaway', 2], ['lookdown', 1.6], ['shift', 2], ['lookaway', 2.4]]], tipsy: ['tipsy', [['jolt', 1], ['laugh', 1.6], ['shift', 3], ['tilt', 2.4]]], high: ['high', [['tilt', 3], ['lookup', 2.6], ['laugh', 1.8], ['feet', 2.4]]],
    groggy: ['tired', [['yawn', 3], ['slump', 3], ['yawn', 3]]], hyper: ['excited', [['bounce', 2], ['feet', 2.4], ['shift', 2], ['nod', 1.2]]], upset: ['sad', [['lookdown', 3], ['sigh', 2.4], ['lookaway', 3]]] };
  const TOUCH_BODY = { poke: ['jolt', 1.2], boop: ['jolt', 1], pat: ['bounce', 1], swat: ['cringe', 1.6], spam: ['cringe', 2], body: ['lookdown', 1.4], petEnd: ['leanback', 2], gift: ['situp', 2.2], wave: ['wave', 2.2], laugh: ['laugh', 2], stare: ['shift', 2.4] };

  function mount(stage, opts = {}) {
    stage.textContent = ''; stage.style.position = 'relative';
    let R = puppet(stage);
    const em = document.createElement('div'); em.style.cssText = 'position:absolute;right:8%;top:8%;font-size:calc(var(--emote, 1) * 22px);line-height:1;opacity:0;pointer-events:none;z-index:2;width:auto;height:auto';
    stage.appendChild(em);
    let mood = 'neutral', temp = null, tempUntil = 0, thinking = false, talkUntil = 0, emoteUntil = 0;
    let blinkAt = performance.now() + 2000, blinkEnd = 0, glanceAt = 0, gaze = { x: 0, y: 0 }, look = { x: 0, y: 0 }, pointerLook = null, pointerLookUntil = 0;
    const sp = { rot: { x: 0, v: 0 }, tx: { x: 0, v: 0 }, ty: { x: 0, v: 0 }, sq: { x: 0, v: 0 } }; // springs, rest at 0
    const taps = [];
    const now = () => performance.now();

    let voice = null, state = ''; let gesture = null, idleAt = 0; // gesture: { name, t0, dur }
    const QUICK = new Set(['nod', 'shake', 'flip', 'jump', 'kiss', 'wave', 'fingerwave', 'eyeroll', 'laugh', 'bounce', 'headbang']);   // these are over when they are over; the rest are poses that hold
    function doGesture(name, dur = 2.2) { gesture = { name, t0: now(), dur: dur * 1000 }; idleAt = now() + dur * 1000 + (STATE[state] ? 14000 + Math.random() * 16000 : 28000 + Math.random() * 40000); if (name === 'nod') kick(0, 0, 70); else if (name === 'shake') kick(0, 90); else if (name === 'wave') kick(90); else if (name === 'tilt') show('playful', dur * 1000); }
    function show(face, ms) { temp = face; tempUntil = now() + ms; }
    function emote(ch, ms = 1400) { em.textContent = ch; emoteUntil = now() + ms; if (opts.onEmote) opts.onEmote(ch); }
    function kick(rot = 0, tx = 0, ty = 0, sq = 0) { sp.rot.v += rot; sp.tx.v += tx; sp.ty.v += ty; sp.sq.v += sq; }
    // Her reserve: touches add up. irk rises with pokes and swats, fond with pats and pets; both fade over a few minutes.
    // Enough of either changes her resting face and how she takes the next touch.
    let irk = 0, fond = 0;
    const RESERVE = { poke: [1, 0], boop: [0.3, 0.5], pat: [0, 1], petEnd: [-1, 2], swat: [2.5, -1], body: [0.7, 0], spam: [3, -1] };
    const sour = () => irk >= 2.4 || (irk < 1.5 && fond >= 3 ? false : ['grumpy', 'tired', 'sad', 'anxious'].includes(mood));
    function touched(kind, dir) {
      const r = RESERVE[kind] || [0, 0]; irk = Math.max(0, Math.min(8, irk + r[0])); fond = Math.max(0, Math.min(8, fond + r[1]));
      react(kind, dir); if (opts.onTouch) opts.onTouch(kind);
    }

    function react(kind, dir = 1) {
      if (TOUCH_BODY[kind]) doGesture(...TOUCH_BODY[kind]);
      if (kind === 'poke') { show('flinch', 500); kick(-dir * 260, -dir * 60); setTimeout(() => { show(sour() ? 'grumpy' : 'surprised', 900); }, 480); }
      else if (kind === 'boop') { show('surprised', 500); kick(0, 0, -40, -3); setTimeout(() => { show('blush', 1800); }, 480); }
      else if (kind === 'pat') { show(sour() ? 'suspicious' : 'joy', 1300); kick(0, 0, 90, -4); if (!sour()) emote('✨', 1000); }
      else if (kind === 'pet') { show(sour() ? 'blush' : 'joy', 700); }
      else if (kind === 'petEnd') { show('joy', 1500); emote('💗', 1500); }
      else if (kind === 'swat') { show('dizzy', 1300); kick(dir * 900, dir * 260, 0, 0); setTimeout(() => { show('angry', 2200); emote('💢', 2000); }, 1250); }
      else if (kind === 'body') { show('suspicious', 1500); emote('❓', 1200); kick(60); }
      else if (kind === 'spam') { show('angry', 2600); emote('💢', 2400); kick(0, 0, 0, 5); }
      else if (kind === 'wave') { show('happy', 1800); kick(120); }
      else if (kind === 'laugh') { show('joy', 2000); kick(0, 0, 60); }
      else if (kind === 'stare') { show('suspicious', 2600); emote('💦', 1600); }
      else if (kind === 'gift') { show('excited', 2200); emote('✨', 1600); kick(0, 0, -70); }
    }

    // ---- touch: tap (where?), stroke over the hair (pet), fast swipe (swat) ----
    let down = null;
    const at = e => R.locate(e);
    // two fingers = pinch to zoom (renderers that can zoom); it never counts as a poke or a swat
    const fingers = new Map(); let pinch = 0, multi = false;
    const spread = () => { const [a, b] = [...fingers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    stage.addEventListener('wheel', e => { if (R.zoom && R.zoom(e.deltaY * 0.0015)) e.preventDefault(); }, { passive: false });
    const lift = e => { fingers.delete(e.pointerId); if (!fingers.size) setTimeout(() => { if (!fingers.size) multi = false; }, 250); };
    stage.addEventListener('pointerup', lift); stage.addEventListener('pointercancel', lift);
    stage.addEventListener('pointerdown', e => { fingers.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (fingers.size === 2) { multi = true; down = null; pinch = spread(); } });
    stage.addEventListener('pointermove', e => {
      if (!fingers.has(e.pointerId)) return; fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 2 && R.zoom) { const d = spread(); if (pinch > 0) R.zoom((pinch - d) / Math.max(120, stage.clientWidth) * 1.6); pinch = d; }
    });
    const onHerAt = p => Math.abs(p.x - 100) < 58 && p.y > 28 && p.y < 330;
    stage.addEventListener('pointerdown', e => { if (multi) return; const p = at(e), inRoom = !!(R.fp && R.fp()); down = { ...p, sx: p.x, t: now(), path: 0, pet: 0, look: inRoom && !onHerAt(p), cx: e.clientX, cy: e.clientY, px: 0 };
      if (inRoom && document.activeElement && document.activeElement.blur) document.activeElement.blur();   // so the keys walk you instead of typing
      try { stage.setPointerCapture(e.pointerId); } catch {} e.preventDefault(); });
    stage.addEventListener('pointermove', e => {
      const p = at(e); pointerLook = { x: (p.x - 100) / 30, y: (p.y - 100) / 34 }; pointerLookUntil = now() + 1500;
      if (!down || multi) return;
      if (down.look) { const mx = e.clientX - down.cx, my = e.clientY - down.cy; down.cx = e.clientX; down.cy = e.clientY; down.px += Math.hypot(mx, my); if (down.px > 6) R.look(mx, my); return; } // visiting: dragging turns your head
      const d = Math.hypot(p.x - down.x, p.y - down.y); down.path += d;
      if (p.y < 92 && now() - down.t > 250) { down.pet += d; if (down.pet > 30) react('pet'); }
      down.x = p.x; down.y = p.y;
    });
    const up = e => {
      if (!down || multi) { down = null; return; } const p = at(e), d = down, ms = now() - d.t, dx = p.x - d.sx; down = null;
      const point = () => { const hit = R.pick(e); if (hit) { const what = R.direct(hit); if (what) { show('surprised', 500); doGesture('nod', 1.2); if (opts.onTouch) opts.onTouch(what); } } };
      if (d.look) { if (d.px <= 8 && R.pick) point(); return; }
      if (Math.abs(dx) > 55 && ms < 380) return touched('swat', Math.sign(dx));
      if (d.pet > 60) return touched('petEnd');
      if (d.path > 25) return;
      // a tap that is not on her: it may be on something in her room, and then she goes and deals with it
      if (!onHerAt(p) && R.pick) { point(); return; }
      const t = now(); taps.push(t); while (taps.length && t - taps[0] > 2500) taps.shift();
      if (taps.length >= 4) { taps.length = 0; return touched('spam'); }
      if (Math.hypot(p.x - 100, p.y - 108) < 9) return touched('boop');
      if (p.y > 150) return touched('body');
      if (p.y < 80) return touched('pat');
      touched('poke', p.x < 100 ? -1 : 1);
    };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', () => { down = null; });

    // ---- the frame loop ----
    let last = now();
    function frame() {
      const t = now(), dt = Math.min(0.05, (t - last) / 1000); last = t;
      for (const k in sp) { const s = sp[k]; s.v += (-170 * s.x - 13 * s.v) * dt; s.x += s.v * dt; }
      irk *= Math.exp(-dt / 90); fond *= Math.exp(-dt / 120);
      const rest = irk >= 2.4 ? 'grumpy' : STATE[state] ? STATE[state][0] : fond >= 3 && irk < 1.5 ? 'happy' : mood;
      const faceName = (t < tempUntil && temp) || (thinking ? 'thinking' : rest);
      const face = FACE[faceName] || FACE.neutral;
      const talking = t < talkUntil;
      if (t > blinkAt) { blinkEnd = t + 130; blinkAt = t + 1800 + Math.random() * 4200; }
      const blink = t < blinkEnd && !['smile', 'squint', 'dizzy'].includes(face.lid);
      const lid = blink ? 'shut' : face.lid;
      const phase = (t / 130 | 0) % 3;
      const mouth = !talking ? face.mouth : voice != null ? (voice > 0.42 ? 'talk' : voice > 0.12 ? 'talk2' : face.mouth) : (phase === 0 ? face.mouth : phase === 1 ? 'talk' : 'talk2');
      // eyes: follow the pointer for a moment, else the expression's resting gaze, else a slow idle glance
      if (t > glanceAt) { gaze = Math.random() < 0.5 ? { x: 0, y: 0 } : { x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2 }; glanceAt = t + 1500 + Math.random() * 3000; }
      const want = t < pointerLookUntil && pointerLook ? pointerLook : (face.gx || face.gy) ? { x: face.gx || 0, y: face.gy || 0 } : gaze;
      look.x += (Math.max(-3, Math.min(3, want.x)) - look.x) * Math.min(1, dt * 10); look.y += (Math.max(-3, Math.min(2.5, want.y)) - look.y) * Math.min(1, dt * 10);
      const breathe = Math.sin(t / 900), rot = sp.rot.x * 0.06 + (face.tilt || 0) + (talking ? Math.sin(t / 160) * 0.8 : 0);
      const tx = sp.tx.x * 0.06, ty = sp.ty.x * 0.06 + (face.drop || 0) + breathe * 0.7, sq = 1 - Math.max(-0.12, Math.min(0.12, sp.sq.x * 0.02));
      // a gesture in progress: name, seconds since it began, and an ease in/out weight 0..1
      // left alone for a while, she moves on her own
      if (!gesture && !talking && !thinking && t > idleAt && !(R.activity && R.activity())) { const shy = (face && face.blush > 0.3) || ['anxious', 'sad', 'tired'].includes(faceName), pool = STATE[state] ? STATE[state][1] : shy ? IDLE_SHY : IDLE; if (idleAt) { const pick = pool[Math.random() * pool.length | 0]; doGesture(pick[0], (pick[1] || 2.2) * (QUICK.has(pick[0]) ? 1 : 1.4)); } idleAt = t + (STATE[state] ? 14000 + Math.random() * 16000 : 28000 + Math.random() * 40000); }
      if ((talking || thinking) && idleAt < t + 25000) idleAt = t + 25000;   // while you two are talking she is with you, not fidgeting
      let g = null;
      if (gesture) { const gt = t - gesture.t0; if (gt > gesture.dur) gesture = null; else g = { name: gesture.name, t: gt / 1000, w: Math.min(1, gt / 350, (gesture.dur - gt) / 450) }; }
      try { R.draw({ t, dt, face, faceName, thinking, lid, blink, mouth, talking, phase, voice: talking ? voice : null, look, rot, tx, ty, sq, breathe, gesture: g }); } catch (e) { if (!frame.warned) { frame.warned = true; console.error('avatar draw', e); } }
      const eo = Math.max(0, Math.min(1, (emoteUntil - t) / 300)); em.style.opacity = eo; em.style.transform = `translateY(${(eo - 1) * 6}px)`;
      em.style.setProperty('--emote', Math.max(1, stage.clientWidth / 104));
      if (stage.isConnected) requestAnimationFrame(frame); else R.dispose();
    }
    requestAnimationFrame(frame);
    // a still picture of her face for the chat log, taken once she has been drawn
    function askThumb() { const mine = R; setTimeout(() => { if (R === mine && R.thumb && opts.onThumb) { try { R.thumb(opts.onThumb); } catch {} } }, 900); }
    askThumb();

    return {
      setMood(m) { mood = FACE[m] ? m : 'neutral'; },
      setThinking(b) { thinking = !!b; },
      // level: how loud her voice is right now (0..1) when the page knows; leave it out and her mouth just keeps time
      talk(level) { talkUntil = now() + 350; thinking = false; voice = typeof level === 'number' ? level : null; },
      feel(text) { text = String(text).slice(-140); for (const [re, face] of FEEL) if (re.test(text)) { show(face, 5000); return face; } return null; },
      react,
      // her finished reply: any action in it that is a gesture she can do gets done (the first one found)
      act(text) {
        for (const m of String(text).matchAll(/\*([^*]+)\*/g)) { const hit = ROUTINE.find(([re]) => re.test(m[1])); if (hit && R.doActivity) { R.doActivity(hit[1]); break; } }
        const found = [];
        for (const m of String(text).matchAll(/\*([^*]+)\*/g)) for (const [re, name, dur] of GEST) if (re.test(m[1])) { found.push([name, dur]); break; }
        let wait = 0; for (const [name, dur] of found.slice(0, 2)) { const hold = dur * (QUICK.has(name) ? 1 : 1.5); setTimeout(() => doGesture(name, hold), wait); wait += hold * 1000 + 1200; }   // each pose is held, then a breath before the next
        return found.map(f => f[0]);
      },
      gesture: doGesture,
      // whether she is in the room: 'gone' (already out), 'leave' (walks out now), 'return' (walks back in; opts.sneak = quietly)
      presence(mode, o) { if (R.presence) R.presence(mode, o || {}); },
      // a video call while she is out: she appears wherever she really is (scene = the backdrop), until call(false)
      call(on, scene) { if (R.call) R.call(on, scene); },
      callShow() { if (R.callShow) R.callShow(); },                                  // on a video call: she turns the phone to show where she is
      // the after-effect that still shows for a while once she is back: '', tipsy, high, groggy, hyper, upset
      setState(kind) { state = STATE[kind] ? kind : ''; if (R.glow) R.glow(state); },
      // her routine (3D model only): what she is busy with right now, in words, and a way to start something
      activity() { return R.activity ? R.activity() : ''; },
      // a posed picture of her (3D model only): resolves to an image URL, or '' if it cannot be drawn
      // scripted (the Studio's events): walk her somewhere (resolves true when she arrives), hold a recorded clip, and what is on offer
      walkTo(x, z) { return new Promise(ok => { if (R.walkTo) R.walkTo(x, z, ok); else ok(false); setTimeout(() => ok(false), 40000); }); },
      holdClip(name, s) { return R.holdClip ? R.holdClip(name, s) : false; }, emote, layout() { return R.layout ? R.layout() : null; }, lists() { return { clips: R.clips ? R.clips() : [], gestures: R.gestures ? R.gestures() : GEST.map(g => g[1]) }; },
      // the heart game: a passing face, a wriggle, the camera closing in on her heart, happy tears
      flash(face, ms) { show(face, ms || 1500); }, squirm(hard) { kick((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 160, 60, hard ? -5 : -3); doGesture(Math.random() < 0.5 ? 'shift' : 'feet', 1.1); },
      focus(k) { if (R.focus) R.focus(k); }, heartPose(i) { if (R.heartPose) R.heartPose(i); }, heartStage(k) { if (R.heartStage) R.heartStage(k); }, bonus(on) { if (R.bonus) R.bonus(on); }, bonusShot() { if (R.bonusShot) R.bonusShot(); }, bonusOrbit(dx, dy, dz) { if (R.bonusOrbit) R.bonusOrbit(dx, dy, dz); }, bonusHit(e) { return R.bonusHit ? R.bonusHit(e) : 0; }, tears(on) { if (R.tears) R.tears(on); },
      snapshot(spec) { return R.snapshot ? R.snapshot(spec) : Promise.resolve(''); },
      // visiting in person (3D model only): 'dorm' or 'house' puts you in the room in first person, '' takes you home
      visit(name) { if (R.visit) R.visit(name || ''); return !!R.visit; }, canVisit() { return !!R.visit; },
      routine(name) { if (R.doActivity) R.doActivity(name); },
      // swap the picture live; null goes back to the cartoon
      setRenderer(r) { R.dispose(); if (r) stage.insertBefore(r.el, em); R = r || puppet(stage); stage.appendChild(em); askThumb(); if (R.glow) R.glow(state); if (opts.onRenderer) opts.onRenderer(); },
    };
  }
  window.WizraAvatar = { mount };
})();
