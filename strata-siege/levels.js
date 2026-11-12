'use strict';
/* Strata Siege levels: the ten base maps and the names and tips of the campaign. Data only.
   A map is a 9x9 grid seen from the corner. A cell is [i, j]: i runs down to the right, j runs down to the left.
   `path` lists the corners of the enemy path. It starts one cell outside the map (-1) and ends on the castle.
   `hut` is the mine hut (the shaft is under it). `water`, `rock`, `hill` and `tree` cells cannot be built on;
   a hill gives a tower more range. Levels 11-20 use the same maps mirrored, levels 21-30 use them again.
   A tip that starts with "NEW:" is highlighted on the level banner. */
window.SS_LEVELS = {
  maps: [
    { path: [[-1, 1], [6, 1], [6, 4], [2, 4], [2, 7], [7, 7]], hut: [4, 6],
      water: [[8, 3], [8, 4]], rock: [[0, 6]], hill: [[4, 2], [3, 5]], tree: [[0, 3], [8, 0], [8, 8], [0, 8], [4, 0]] },
    { path: [[1, -1], [1, 2], [4, 2], [4, 5], [1, 5], [1, 7], [6, 7]], hut: [6, 4],
      water: [[7, 0], [8, 0], [8, 1]], rock: [[3, 8]], hill: [[2, 3], [3, 6]], tree: [[6, 1], [8, 5], [0, 4], [8, 8], [3, 0]] },
    { path: [[-1, 4], [2, 4], [2, 1], [6, 1], [6, 6], [3, 6], [3, 8]], hut: [4, 3],
      water: [[0, 0], [0, 1]], rock: [[8, 8], [8, 3]], hill: [[4, 4], [1, 2]], tree: [[8, 0], [0, 7], [5, 8], [7, 4], [1, 6]] },
    { path: [[4, -1], [4, 2], [7, 2], [7, 5], [1, 5], [1, 8], [5, 8]], hut: [3, 3],
      water: [[0, 0], [1, 0], [0, 1]], rock: [[8, 8]], hill: [[5, 3], [2, 6], [6, 6]], tree: [[8, 0], [0, 3], [7, 7], [2, 2], [6, 0]] },
    { path: [[-1, 2], [3, 2], [3, 0], [7, 0], [7, 4], [4, 4], [4, 7], [8, 7]], hut: [1, 5],
      water: [[5, 2], [6, 2], [5, 1]], rock: [[0, 8]], hill: [[5, 5], [2, 3]], tree: [[0, 0], [8, 2], [2, 7], [6, 8], [8, 5]] },
    { path: [[-1, 6], [2, 6], [2, 2], [5, 2], [5, 6], [8, 6], [8, 2]], hut: [4, 4],
      water: [[0, 0], [1, 0]], rock: [[7, 8], [0, 3]], hill: [[3, 3], [6, 5], [7, 3]], tree: [[4, 0], [8, 8], [0, 8], [3, 8], [6, 0]] },
    { path: [[0, -1], [0, 7], [3, 7], [3, 1], [6, 1], [6, 7]], hut: [8, 4],
      water: [[8, 0], [8, 1]], rock: [[4, 8]], hill: [[1, 3], [4, 4], [5, 5]], tree: [[1, 0], [8, 7], [1, 8], [7, 3], [4, 0]] },
    { path: [[-1, 0], [8, 0], [8, 8], [1, 8], [1, 3], [5, 3], [5, 5]], hut: [3, 6],
      water: [[3, 5], [4, 5]], rock: [[0, 4]], hill: [[6, 4], [4, 2], [6, 6]], tree: [[7, 2], [0, 7], [3, 1], [7, 7], [0, 2]] },
    { path: [[-1, 3], [3, 3], [3, 6], [6, 6], [6, 2], [8, 2]], hut: [1, 6],
      water: [[4, 0], [5, 0], [4, 1], [4, 8]], rock: [[8, 8]], hill: [[4, 4], [7, 4], [2, 2]], tree: [[0, 0], [8, 5], [0, 8], [7, 0], [5, 8]] },
    { path: [[-1, 1], [7, 1], [7, 3], [1, 3], [1, 5], [7, 5], [7, 7], [2, 7]], hut: [4, 8],
      water: [[8, 8]], rock: [[0, 8], [8, 4]], hill: [[4, 2], [4, 4], [4, 6]], tree: [[0, 0], [8, 0], [0, 6], [6, 8], [2, 8]] },
  ],
  names: [
    'Garden Path', 'Turnip Row', 'The Old Mine', 'Windy Hill', 'Duck Pond', 'Crooked Lane', 'Switchback', 'Snail Shell', 'Short Cut', 'The Long Walk',
    'Back Garden', 'Rhubarb Row', 'Hamster Heights', 'Breezy Bank', 'Goose Green', 'Bent Lane', 'Zigzag', 'Whirlpool', 'Quick Way Round', 'The Mole Hills',
    'Last Lawn', 'Marrow Row', 'Deep Shaft', 'Gale Hill', 'Puddle Park', 'Dog Leg', 'Hairpin', 'Helter Skelter', 'No Short Cut', 'Thunder Road',
  ],
  tips: {
    1: 'Tap the grass to build a tower. Tap the path to stomp with the Boot',
    2: 'NEW: balloons fly over the path. Only a Kite Launcher reaches them',
    3: 'NEW: the mine. Press DIG, then tap the dirt next to a tunnel. Loot counts when a hamster carries it home',
    4: 'NEW: Brain Freeze. Some towers like their neighbours: a heart shows a pair. A number in the mine counts the dangers around it',
    5: 'NEW: the sky. Drag a cloud onto another to mix weather. It works where the shadow falls. A flick makes a cloud glide',
    6: 'NEW: the Banana Peeler. A crystal under a tower makes it stronger. Dig it up for gems instead?',
    7: 'NEW: golden puffs. Do something on all three layers quickly for double coins',
    8: 'NEW: dynamite and the Teapot Mortar. A blast below shakes the path above',
    9: 'NEW: sapper moles tunnel for the castle. Bonk them underground, or stomp the lump',
    10: 'BOSS! Mama Hen lays eggs on the path. Tap an egg before it hatches',
    11: 'NEW: the Tesla Toaster. A tunnel under the path can be collapsed into a pit',
    12: 'NEW: frosty puffs. Frost and a puff make snow',
    13: 'Scrub a weather cloud to and fro to wring it all out at once',
    14: 'Tap under a storm to call a bolt. A storm with nobody to hit digs in the mine',
    15: 'King Rat is back, and he brought a friend',
    16: 'In the mine the tool button has chalk. Mark the dirt you do not trust: a right mark pays a gem',
    17: 'Dynamite on a danger sends it upwards, at the enemy',
    18: 'During a Strata Combo, hop between layers for up to four times the coins',
    19: 'Stomp a curled hedgehog to bowl it back down the path',
    20: 'BOSS! The Tunnel Tyrant dives under your towers. Bonk him in the mine',
    30: 'BOSS! The Thunder Goose. Storm clouds hurt her most',
  },
};
