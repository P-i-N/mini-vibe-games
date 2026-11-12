# Mini Vibe Games

Small browser games playable one-handed: touch on a phone or tablet, or mouse only.

Play: https://p-i-n.github.io/mini-vibe-games/

| Game | Folder |
| --- | --- |
| Brick Bazaar: brick breaker with 50 levels, five bosses, a coin shop, self-reloading guns, drones, fever mode, relics and synth music | [`brick-bazaar/`](brick-bazaar/) |
| Strata Siege: three-layer tower defense with a weather cloud, digging hamsters and a gem shop | [`strata-siege/`](strata-siege/) |

Every game is plain HTML/CSS/JS with no build step. Pushing to `main` deploys to GitHub Pages.

To run the games locally, serve the repository root (for example `python -m http.server`) and open `http://localhost:8000/`.
After a change to a game, increase the `?v=` number of its scripts and stylesheet in its `index.html`. Browsers then load the new files.

## Brick Bazaar notes

| File | Contents |
| --- | --- |
| `game.js` | Game rules, shop, enemies, bosses, rendering |
| `levels.js` | The 50 campaign maps and the map legend. Levels after 50 are generated in `game.js`. |
| `audio.js` | Synthesised sound effects and generative music. Effects take their pitch from the chord that the music plays. The music has five channels; the menu and the shop fade to an ambient mix. The music follows the game through `fever(on)`, `streak(n)`, `rush(secondsLeft)` and `beat()`. The effects that fire most often play the next note of a riff, on the grid of the music, each family with its own instrument; big moments end on the tonic. Each level has one of six styles (mode, tempo, swing). |
| `snail.js` | The lines of Mortimer, the snail who keeps the shop. Data only: `BB_SNAIL.lines[key]` is a list, and the game picks one line at random. |
| `minigames.js`, `minigames.css` | The arcade mini-games of the shop (`BBMini.list`, `BBMini.play`). They do not use game.js. |
| `rounds.js` | Bonus rounds that are other games (pachinko, a salad tower, a kart lap, karaoke). Each is a plug-in: it talks to the game only through the `api` object of `roundApi` in game.js. |
| `style.css` | Menus, shop, results screens |

`window.__bb` in the browser console is a debug hook: `step(dt)`, `draw()`, `clear()`, `give(coins)`, `buyId(id)`, `relic(id)`, `capsule(kind)`, `fever()`, `skip()`, `blimp(kind)`, `safari(kind)`, `panic()`, `shop()` (the stock with state and price), `summary` (the last level result), `toughness(level)`, `critter(kind)`, `seals(n)`, `special(id)`, `set(id)`, `flare(n)`, `loose()`, `starRun(relicId)`, `daily()`, `victory()`, `tap(x, y)`. To go to a level: `__bb.run.level = 40; __bb.next()`.

A new run reveals the game level by level. Three tables in `game.js` set the schedule: `at` on each entry of `ITEMS` (the level from which the shop stocks it), `FROM` (capsules, fever, sales, streaks, blimps, the clock, the sweet spot, heat, specials, the smash) and `PU_FROM` (the first level of each capsule). A level tip in `levels.js` that starts with `NEW:` is highlighted on the level banner.

Balance values that belong together: `HP_CURVE` (brick toughness by level), `BOSS_K` (boss health as a multiple of the brick toughness), `GUNS` (rate, clip, reload, damage), the `base`/`grow` prices in `ITEMS`, and the coin value (`levelVal`, `coinVal`). Change one, then play some levels at both ends of the campaign.

Three systems keep a long run in balance:

*   **Heat.** After each level from `FROM.heat`, the clear time changes `run.heat` (`heatStep`): a level that takes `HEAT_TARGET` of its clock changes nothing, a faster level adds up to 3 points, a slower level removes up to 3. One point of heat makes bricks 25% tougher (`HEAT_HP`) and the level bonuses 6% bigger (`HEAT_PAY`, up to `HEAT_PAY_MAX`). `HP_CURVE` is the toughness for average play; heat corrects it for each player.
*   **Prices.** From level `PRICE_FROM`, shop prices follow the wealth of the run (`priceIndex`): what the run has earned against `refCoins(level)`, the money of an average run at that level. A rich run pays more and a poor run pays less. This keeps the shop from being bought empty, whatever new coin source the game gets.
*   **Guns.** A reload runs slowly by itself and each paddle bounce takes time off it (`RELOAD_IDLE`, `RELOAD_HIT`). Brick toughness then pushes against play, not against guns that fire without the player. Do not add a weapon that works at full power with no paddle play, and do not add anything that removes a brick whatever its health.
*   **The clock.** From `FROM.clock`, each level has a time limit (`parTime`). A level that is not clear in time pays no clear, speed, star or heat bonus and no lucky spin. The remaining bricks crumble without loot.
*   **Coin value.** The value of a coin rises with the level (`levelVal`), so the income follows the prices. The coin upgrades add small percentages. Do not add an upgrade that multiplies the income without a steep price.

Blimps are in the `BLIMPS` table (hits, coins, first level). Only a ball can hurt a blimp. The same rule applies to pinata bricks (`J` in a map) and to a runner (a mimic brick that leaves the wall on its first hit).

Bonus rounds are in the `BONUS` table: Blimp Safari, Piñata Party and Bumper Bazaar. A bonus round has no bricks and no ball can be lost (`startSafari(kind)`, `G.safari` holds the kind). One starts after each boss, and the shop sells a ticket for a random one.

Skill shots are in `paddleSkill`: the sweet spot (a mark on the paddle that moves after each bounce) and the smash (a tap just before the bounce). They are the answer to levels that play themselves; keep new damage sources tied to paddle play.

A map in `levels.js` can move: `slide` makes a row a conveyor, `wheel` adds bricks that turn around a hub, `O` is a bumper and `(` `)` are a pair of portals (`genLevel`, `setupField`, `updateField`). The specials WINDY DAY and NIGHT MARKET change the whole field.

Rules for a map, from play feedback:

*   Stone is not in the three top rows, and no destructible brick sits behind a stone line with one-cell gaps. A conveyor row is the exception.
*   A map lets the ball get between the bricks. Full rows with empty rows between them make a slow level, because the ball then breaks one brick for each trip to the paddle.
*   Later maps are tall (up to 14 rows) and have a lower formation under an empty corridor.
*   The last fifth of the bricks pulls the balls (`seekFrom`), so that the end of a level does not drag.

A dev check for these rules is not in the repository; the level numbers of the `NEW:` tips and the boss maps (top five rows empty) must stay as they are.

The results screen (`showTally`) shows two sums, one line of the snail and a few one-line notes. Its button is outside the part that scrolls. Keep it short: put new information in a note, not in a new row.

The shop has an arcade tab: each mini-game of `BBMini.list` is a shop item whose price is the stake (`startMini`). After every third level from `FORK_FROM`, the snail offers a fork in the road (`showFork`).

Things that a late run earns or meets (each has a `*_FROM` constant for its first level):

*   **Creatures:** frogs that take the ball and spit it back as a fireball, ledge walkers that fall when their brick breaks (the paddle can catch them), peekaboos behind bricks, pigeons, the snail on his lunch break, and a boss that looks in from the side (`G.cameo`). `crowd(from, share, max)` sets how many come. Turtle bricks (`U` in a map) take damage only from above and from the side.
*   **Bazaar Seals:** a second currency that only skill pays (three stars, a dare, a boss, three DING ×3 chains in one level). The "Upstairs" tab sells for seals: a relic reroll, a price lock, and relic fusions (`FUSIONS`: two relics become one with a new rule). Seals do not follow the price index.
*   **Item sets** (`SETS`): a full set of upgrades at their maximum gives a bonus.
*   **Spotter's Flare, the Ball Boy, the parrot:** items that need a tap, a wage or paddle bounces to do their work.
*   **Specials:** LANDSLIDE moves bricks down into gaps (`row` stays correct); INSOMNIA MARKET and CUCKOO follow the real clock.
*   **After level 50:** a new run with a star keeps one relic and starts at a higher Heat (`meta.stars`). **Bazaar of the Day** is a run of 10 levels with rules from the date; it does not touch the normal save.

To add a bonus round, add an entry to `window.BBRounds` in rounds.js; game.js needs no change. A round pays through `api.coin` and `api.pay`, and `ROUND_COINS` limits one round.

Data that outlives a run is in `meta` (`localStorage` key `brickbazaar.meta.v1`): the sticker album (`STICKERS`, `sticker(id)`) and the lifetime totals. Stickers open starting kits (`KITS`). To reset them, remove that key.

The shop has a keeper, Mortimer. His lines are in `QUIPS` and change nothing in the game. The tip jar, the haggle, double or nothing, the Dare (`DARES`) and the Oddity (`ODDS`) are in the same section as `buy`.
