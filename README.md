# Mini Vibe Games

Small browser games playable one-handed: touch on a phone or tablet, or mouse only.

Play: https://p-i-n.github.io/mini-vibe-games/

| Game | Folder |
| --- | --- |
| Brick Bazaar: brick breaker with a coin shop, guns, ammo, magnets, drones, fever mode, relics and synth music | [`brick-bazaar/`](brick-bazaar/) |
| Strata Siege: three-layer tower defense with a weather cloud, digging hamsters and a gem shop | [`strata-siege/`](strata-siege/) |

Every game is plain HTML/CSS/JS with no build step. Pushing to `main` deploys to GitHub Pages.

To run the games locally, serve the repository root (for example `python -m http.server`) and open `http://localhost:8000/`.
After a change to a game, increase the `?v=` number of its scripts and stylesheet in its `index.html`. Browsers then load the new files.

## Brick Bazaar notes

| File | Contents |
| --- | --- |
| `game.js` | Game rules, shop, levels, rendering |
| `audio.js` | Synthesised sound effects and music. Effects take their pitch from the chord that the music plays. |
| `style.css` | Menus, shop, results screens |

`window.__bb` in the browser console is a debug hook: `step(dt)`, `clear()`, `give(coins)`, `buyId(id)`, `relic(id)`, `capsule(kind)`, `fever()`, `skip()`.
