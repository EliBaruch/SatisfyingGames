# Releases

What has been live at https://bloom-rush-game.netlify.app, newest last. `node tools/release.js verify` appends a
line after every deploy; the live site also serves `/release.json` with the exact commit.

Before 19 November 2026 deploys were uploaded by hand from different branches and nothing recorded which commit
went live. The rows marked *reconstructed* were matched from Netlify's deploy times to commit times.

| Date (UTC) | Commit | Netlify deploy | What |
|---|---|---|---|
| 2026-11-17 17:12 | ? | `6afc8b0ade3c24eae1c856bd` | *reconstructed*: thrills line (`claude/optimistic-shannon-d0e452`) |
| 2026-11-18 05:06 | ? | `6afd32385e7f1d8cc32b34a2` | *reconstructed*: thrills line, town world |
| 2026-11-18 05:26 | `babcb23` | `6afd370a1db40dee26ed6e87` | *reconstructed*: town thumbnail, trimmed bonus payouts |
| 2026-11-18 09:03 | `d753d91` | `6afd69c6a5fd53ef7c663f2a` | *reconstructed*: Gate Run, Raid and Harvest Rush bonus levels |
| 2026-11-18 22:52 | `162ce91` | `6afe2c1c4af518ae85ec9ab9` | **Regression**: Ironwall Keep, deployed from the release branch, which lacked everything on the thrills line, so the live site lost the thrills, trophies, missions, the town world and the bonus levels |
| 2026-11-19 09:19 | `0a45c25` | `6afebecdfa9f48295341e8b8` | Release guard: quote the branch-list format |
