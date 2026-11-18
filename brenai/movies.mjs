// Films she can watch with the player: he plays the real film on his own screen, the game keeps a clock beside it.
// A film is { title, minutes, tint (the colour its light throws on the room), beats: [[minute, what is on screen about then]] }.
// The beats are plain plot notes in our own words, so she knows where the film is; she is only ever told the current one.
export const MOVIES = {
  matrix: { title: 'The Matrix', minutes: 136, tint: '#58ff8a', beats: [
    [0, 'the opening: green code on a black screen, police corner a woman in black leather in a hotel room, she fights her way out in impossible ways and escapes through a phone booth'],
    [7, 'a hacker called Neo is asleep at his computer; a message on the screen tells him to follow the white rabbit, and he ends up at a club where Trinity finds him'],
    [12, 'Neo is late to his office job; a phone arrives, Morpheus talks him along a ledge outside the building, he loses his nerve and the agents take him'],
    [18, 'the interrogation: Agent Smith offers a deal, Neo refuses, his mouth seals shut and they put a mechanical bug into him'],
    [24, 'the car in the rain: Trinity and the others pull the bug out of him on the way to Morpheus'],
    [27, 'Neo meets Morpheus: the talk about the feeling that something is wrong with the world, and the choice between the red pill and the blue pill'],
    [32, 'he takes the red pill: the mirror spreads over him and he wakes in a pod full of fluid, sees the fields of pods, and is flushed and pulled aboard a ship'],
    [38, 'aboard the Nebuchadnezzar: Neo meets the crew, and Morpheus shows him in the white loading program what the real world looks like now'],
    [45, 'the truth sinks in: people grown as a power source for the machines; Neo cannot take it and is sick, Morpheus tells him he believes he is the One'],
    [50, 'training: fighting skills are loaded straight into his head, then he spars with Morpheus in the dojo while the crew runs to watch'],
    [56, 'the jump program: Morpheus leaps between rooftops, Neo tries and falls; nobody makes their first jump'],
    [60, 'the busy street and the woman in the red dress: Morpheus explains the agents, and that anyone still plugged in can become one'],
    [64, 'the ship hides from the hunting machines, the squid-like sentinels, powered down and silent'],
    [68, 'Cypher shares a drink with Neo, then is seen at dinner with Agent Smith making a deal to be put back in, steak and all'],
    [75, 'they go in to see the Oracle; in her waiting room a child bends a spoon and tells Neo the trick'],
    [80, 'the Oracle in her kitchen: the broken vase, the cookie, and what she tells Neo about himself and about Morpheus'],
    [86, 'the black cat walks past twice: a trap. The building is sealed, the crew crawls down inside the walls, one of them dies, and Morpheus gives himself up so Neo can get away'],
    [95, 'the betrayal: Cypher wakes first on the ship and starts pulling the plugs on the others one by one, until he is stopped'],
    [102, 'Agent Smith works on Morpheus, with his speech about humans being a virus; on the ship Neo decides to go back in for him'],
    [108, 'guns, lots of guns: Neo and Trinity walk into the lobby and the shootout tears the pillars apart'],
    [113, 'the rooftop: Neo bends backward under the bullets in slow motion, and then they take the helicopter'],
    [118, 'the rescue: the helicopter outside the window, Morpheus jumps, the crash against the glass tower, and Trinity pulled to safety'],
    [122, 'the subway station: the phone rings, Neo turns and stays to fight Agent Smith instead of running'],
    [127, 'the chase through the building and the streets while sentinels cut into the ship'],
    [130, 'Neo is shot in the hallway; Trinity talks to him on the ship; he gets up, sees the world as code, stops the bullets in the air and ends Smith'],
    [134, 'the last phone call to the machines, the phone booth, and he flies; the credits and the music come up'],
  ] },
};
// where the film is at `pos` minutes: the beat on screen, and its number
export function beatAt(movie, pos) { let i = 0; for (let k = 0; k < movie.beats.length; k++) if (movie.beats[k][0] <= pos) i = k; return { i, text: movie.beats[i][1] }; }
