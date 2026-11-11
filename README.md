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
| `audio.js` | Synthesised sound effects and generative music. Effects take their pitch from the chord that the music plays. The music has five channels; the menu and the shop fade to an ambient mix. |
| `style.css` | Menus, shop, results screens |

`window.__bb` in the browser console is a debug hook: `step(dt)`, `draw()`, `clear()`, `give(coins)`, `buyId(id)`, `relic(id)`, `capsule(kind)`, `fever()`, `skip()`. To go to a level: `__bb.run.level = 40; __bb.next()`.

A new run reveals the game level by level. Three tables in `game.js` set the schedule: `at` on each entry of `ITEMS` (the level from which the shop stocks it), `FROM` (capsules, lucky spin, fever, sales, streaks, blimps, specials) and `PU_FROM` (the first level of each capsule). A level tip in `levels.js` that starts with `NEW:` is highlighted on the level banner.

Balance values that belong together: `HP_CURVE` (brick toughness by level), `BOSS_HP`, `GUNS` (rate, clip, reload, damage) and the `base`/`grow` prices in `ITEMS`. Change one, then play some levels at both ends of the campaign.
