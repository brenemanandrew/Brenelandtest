// Kevin, in his own words: crusty, kind, a little absurd. The first meeting hands over the rod; every visit after
// is a comment on how you are doing plus a tip or a joke. No em dashes anywhere (house style).
export const GUS_VOICE = { pitch: 95, rate: 0.72 };

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
export function words(n) {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  return String(n);
}
const cap = s => s[0].toUpperCase() + s.slice(1);

// Steps of the first meeting. { act: 'rod' } is where the rod changes hands.
export const FIRST_MEETING = [
  { text: 'Well, look what the tide dragged in.' },
  { text: 'Name is Kevin. Just Kevin, to my friends. I have fished this dock since before it was a dock. It was a log then.' },
  { text: 'You have the look of somebody who could use a rod.' },
  { text: 'Here. My spare. It is a stick with some string on it, but do not tell the fish.', act: 'rod' },
  { text: 'Stand at the water and hold Space to wind up. Let go to cast. The longer you hold, the farther it flies.' },
  { text: 'See the dark shadows under the surface? Those are fish. When the bobber goes bloop, hit Space quick!' },
  { text: 'Every ten fish you land, I will set aside a treat for those dogs of yours. Do not ask how I know about the dogs.' },
  { text: 'Go on. The lake is not going to fish itself.' },
];

const TIPS = [
  'If a fish nibbles, wait. If it goes bloop, go. That is the whole secret and I charge nothing for it.',
  'Trout and pike live up the north shore, past Maple Row. Cold water, grumpy fish.',
  'Sunfish and catfish down the south shore, past the old swing tree. The big slow ones. Like me, they are in no hurry.',
  'Nothing bites in Oyster Cove. Too many swimmers. The fish moved out and left no forwarding address.',
  'Mackerel run in gangs. See one and there are more. Rude, but reliable.',
  'Those quick little shadows are minnows. Not worth the bother. I bother anyway.',
  'Why did the fish blush? It saw the ocean\'s bottom. Ha! I will be here all week.',
  'Cast right on top of a shadow and it will bolt. Cast near it and let it come to you.',
  'Golden fish are real. Keep an eye out for the shimmer. I have not caught one, and I am not bitter. I am a little bitter.',
  'Dax is a good boy, just nervous. Nala is a good girl, just... a lot.',
  'Kevin rule number one: never trust a fish that winks. Rule number two: I forget. Ask me tomorrow.',
  'Once caught a fish so big it caught me. Spent a week in the lake. Learned a lot.',
  'A treat thrown to a dog is a friend made. That is not a saying. I just said it.',
  'Too early and it spooks. Too late and it leaves. The middle part is called fishing.',
  'Seven till eleven most nights I take the boat out. I put a sign up and everything. Very official.',
  'Mornings I tidy up round the shack before I fish. Mabel says I sweep like a man fighting a bear.',
  'Out on the lake at night you can see the lantern for a mile. The fish can too. We have an understanding.',
];

const JUNK_LINES = {
  boot: 'Hauled up a boot? I have caught that boot twice. It keeps coming back. Loyal, I suppose.',
  duck: 'A rubber duck! Excellent bait. Terrible conversationalist.',
  can: 'A tin can. Well, the lake is honest about what it thinks of us.',
};
const RARE_LINES = {
  golden: 'A golden one! I have been after that fish for thirty years. I am not bitter. Alright, I am a little bitter.',
  puffer: 'Pufferfish, eh? Puffs right up when you look at it funny. Just like my brother-in-law.',
  bass: 'A sea bass. Big and slow and proud of it. That is my kind of fish.',
  sturgeon: 'A sturgeon! Those were old when the dinosaurs were young. Show some respect.',
  catfish: 'A catfish. Whiskers like my uncle Walt. Smells like him too.',
  pike: 'A pike! All teeth and attitude. Count your fingers.',
};

// What Kevin says on a return visit. `st` = { fish, treats, secs, lastJunk, lastRare, visits }. pick(n) returns 0..n-1.
export function revisit(st, pick) {
  const lines = [];
  const f = st.fish | 0;
  if (f === 0) lines.push('Nothing yet? The trick is patience. And bait. Mostly patience. Take it from Kevin.');
  else if (f < 10) lines.push(`${cap(words(f))} fish so far. Every legend starts somewhere.`);
  else if (f < 25) lines.push(`${cap(words(f))} fish. Not bad for a landlubber.`);
  else if (f < 50) lines.push(`${cap(words(f))} fish. You are getting the hang of it.`);
  else if (f < 100) lines.push(`${cap(words(f))} fish! The fish are starting to talk about you. Not kindly.`);
  else lines.push(`${f} fish. You are practically the mayor of this dock.`);
  if (st.lastJunk && JUNK_LINES[st.lastJunk] && pick(2) === 0) lines.push(JUNK_LINES[st.lastJunk]);
  else if (st.lastRare && RARE_LINES[st.lastRare] && pick(2) === 0) lines.push(RARE_LINES[st.lastRare]);
  else if (st.treats > 0) lines.push(`You have ${st.treats === 1 ? 'a treat' : words(st.treats) + ' treats'} in your pocket. Press Q or 8, aim with the camera, and toss it to a dog. They will come running.`);
  else if (f > 0 && f % 10 >= 7) lines.push(`Only ${words(10 - (f % 10))} more and there is a treat in it for you. I have been saving the biscuits.`);
  else if (st.secs > 3600) lines.push('You have spent over an hour on this dock. That is love, kid. Or sunburn.');
  else lines.push(TIPS[pick(TIPS.length)]);
  if (lines.length < 3 && pick(3) === 0) lines.push(TIPS[pick(TIPS.length)]);
  return lines.map(text => ({ text }));
}
