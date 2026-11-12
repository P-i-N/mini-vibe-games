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
| `audio.js` | Synthesised sound effects and generative music. Effects take their pitch from the chord that the music plays. The music has five channels; the menu and the shop fade to an ambient mix. The music follows the game through `fever(on)`, `streak(n)`, `rush(secondsLeft)` and `beat()`. |
| `style.css` | Menus, shop, results screens |

`window.__bb` in the browser console is a debug hook: `step(dt)`, `draw()`, `clear()`, `give(coins)`, `buyId(id)`, `relic(id)`, `capsule(kind)`, `fever()`, `skip()`, `blimp(kind)`, `safari(kind)`, `panic()`, `shop()` (the stock with state and price), `summary` (the last level result), `toughness(level)`. To go to a level: `__bb.run.level = 40; __bb.next()`.

A new run reveals the game level by level. Three tables in `game.js` set the schedule: `at` on each entry of `ITEMS` (the level from which the shop stocks it), `FROM` (capsules, lucky spin, fever, sales, streaks, blimps, the clock, the sweet spot, heat, specials, the smash) and `PU_FROM` (the first level of each capsule). A level tip in `levels.js` that starts with `NEW:` is highlighted on the level banner.

Balance values that belong together: `HP_CURVE` (brick toughness by level), `BOSS_K` (boss health as a multiple of the brick toughness), `GUNS` (rate, clip, reload, damage), the `base`/`grow` prices in `ITEMS`, and the coin value (`levelVal`, `coinVal`). Change one, then play some levels at both ends of the campaign.

Three systems keep a long run in balance:

*   **Heat.** After each level from `FROM.heat`, the clear time changes `run.heat`: less than 30% of the clock adds heat, more than 60% removes heat, a timeout removes two. One point of heat makes bricks 25% tougher (`HEAT_HP`) and the level bonuses 6% bigger (`HEAT_PAY`). `HP_CURVE` is the toughness for average play; heat corrects it for each player.
*   **The clock.** From `FROM.clock`, each level has a time limit (`parTime`). A level that is not clear in time pays no clear, speed, star or heat bonus and no lucky spin. The remaining bricks crumble without loot.
*   **Coin value.** The value of a coin rises with the level (`levelVal`), so the income follows the prices. The coin upgrades add small percentages. Do not add an upgrade that multiplies the income without a steep price.

Blimps are in the `BLIMPS` table (hits, coins, first level). Only a ball can hurt a blimp. The same rule applies to pinata bricks (`J` in a map) and to a runner (a mimic brick that leaves the wall on its first hit).

Bonus rounds are in the `BONUS` table: Blimp Safari, Piñata Party and Bumper Bazaar. A bonus round has no bricks and no ball can be lost (`startSafari(kind)`, `G.safari` holds the kind). One starts after each boss, and the shop sells a ticket for a random one.

Skill shots are in `paddleSkill`: the sweet spot (a mark on the paddle that moves after each bounce) and the smash (a tap just before the bounce). They are the answer to levels that play themselves; keep new damage sources tied to paddle play.

A map in `levels.js` can move: `slide` makes a row a conveyor, `wheel` adds bricks that turn around a hub, `O` is a bumper and `(` `)` are a pair of portals (`genLevel`, `setupField`, `updateField`). The specials WINDY DAY and NIGHT MARKET change the whole field.

Data that outlives a run is in `meta` (`localStorage` key `brickbazaar.meta.v1`): the sticker album (`STICKERS`, `sticker(id)`) and the lifetime totals. Stickers open starting kits (`KITS`). To reset them, remove that key.

The shop has a keeper, Mortimer. His lines are in `QUIPS` and change nothing in the game. The tip jar, the haggle, double or nothing, the Dare (`DARES`) and the Oddity (`ODDS`) are in the same section as `buy`.
