# Bloom Rush: rules for every session

Read `README.md` for the game and `docs/ENGINE.md` before changing the engine.

## Releasing (read before any merge or deploy)

The live game is https://bloom-rush-game.netlify.app (Netlify project `bloom-rush-game`, site id
`854c80d9-26b0-4c2b-8f9f-9f1278f50979`). It is deployed by upload, not from git, so **whatever folder is uploaded
replaces the whole live game**. On 18 November 2026 a deploy from a branch that lacked the live work removed the
thrills, trophies, missions, the town world and the bonus levels from the live site. These rules exist so that
does not happen again.

1. **One release branch: `claude/clever-allen-0k86le`.** Only its tip is ever deployed. Feature branches are
   merged into it first (merge, never force-push, never rebase it).
2. **Before starting work**, fetch and branch from the release branch's tip, and look at `RELEASES.md` to see
   what is live. If another branch holds unmerged work that is live or meant to ship, merge it in first.
3. **Before deploying, run `node tools/release.js check`** (with `python3 -m http.server 8100` running). It refuses
   when the tree is dirty, when HEAD is not the release branch's tip, when anything live is missing from HEAD, or
   when any world or bonus-level test fails, and it lists every branch with commits HEAD does not contain.
   Never deploy past a failed gate, never with `--quick`. On success it writes `release.json` (git-ignored, never
   committed: it names the commit being uploaded, and the live site serves it so the next check knows what is live).
4. **After deploying, run `node tools/release.js verify --deploy=<id>`**, then commit and push the line it adds
   to `RELEASES.md`. If the live check fails, fix forward and redeploy.
5. **A merge that touches another line of work must keep it working**: resolve conflicts by keeping both sides,
   then rerun every world's playtest and the bonus tests, not only the ones you changed.
6. Deploying or merging into the release branch needs the owner's go-ahead in the current conversation.

## Adding a world

A world touches shared lists: `src/engine/worlds.js` (order, unlock), the previous last world's travel pad and
`finale.next`, `src/engine/audio.js` (`WORLD_IDS`, `MUSIC_BARS`, its music bar), `src/engine/hud.js` (icon,
`CARD_COLOR`), `styles.css` (card colour), `assets/ui/world-<id>.jpg` (title card art, 400 x 640),
`src/engine/run/theme.js`, `src/engine/raid/index.js` and `src/engine/rush/theme.js` (bonus-level dressing), and
the README. Tune its pace with the thrills on: `node tools/playtest.js --world=<id>`.
