// Level flow: unlock feedback (toast, sound, confetti, camera glide), the finale
// (perk, finished flag, celebration, win card) and showing a pending win card on boot.
import { getPadEffect } from './registry.js';
import { PERK } from './config.js';
import { nextWorld, worldInfo } from './worlds.js';

export function createLevel(G) {
  const def = G.world;
  const finale = def.finale || {};

  G.events.on('unlock', ({ pad, effect } = {}) => {
    if (!pad) return;
    const h = effect && getPadEffect(effect.type);
    const text = pad.toast || (h && h.toast ? (typeof h.toast === 'function' ? h.toast(effect, pad) : h.toast) : pad.label + '!');
    G.hud.toast(text);
    G.audio.play(pad.big && (!h || h.sound !== 'hire') ? 'bigUnlock' : (h && h.sound) || 'unlock');
    const p = { x: pad.pos.x, y: 0.2, z: pad.pos.z };
    G.fx.confetti(p, pad.big ? 110 : 60);
    G.fx.ring(p, { color: 0xffe14d, radius: pad.big ? 4.5 : 3, life: 0.7 });
    if (pad.big) G.fx.shake(0.35, 0.35);
    // glide the camera to a far-away new thing
    let f = pad.focus || (h && h.focus ? h.focus(G, effect, pad) : null);
    if (!f) f = pad.pos;
    if (pad.big && G.player && G.view && Math.hypot(f.x - G.player.pos.x, f.z - G.player.pos.z) > 10) G.view.glideTo(f.x, f.z, 1.6);
    G.saveNow();
  });

  /** Mark the world finished and grant its perk (idempotent). */
  function finish() {
    const meta = G.save.meta;
    const already = !!meta.finished[G.worldId];
    meta.finished[G.worldId] = true;
    if (!meta.perks[G.worldId]) meta.perks[G.worldId] = { ...PERK, ...(finale.perk || {}) };
    if (!already) G.refresh(true);   // perk applies at once (speed, capacity)
  }

  function nextInfo() {
    const id = finale.next || (nextWorld(G.worldId) || {}).id || null;
    if (!id) return null;
    const w = worldInfo(id);
    return { id, name: (w && w.name) || id };
  }

  G.events.on('win', () => {
    finish();
    G.hud.setGoal('');
    G.audio.play('win');
    const f = finale.focus || { x: G.player.pos.x, z: G.player.pos.z, w: 8, d: 8 };
    let n = 0;
    const storm = setInterval(() => {
      for (let k = 0; k < 3; k++) {
        G.fx.confetti({ x: f.x + (Math.random() - 0.5) * (f.w || 8), y: 0.5, z: f.z + (Math.random() - 0.5) * (f.d || 8) }, 70);
      }
      if (++n >= 8) clearInterval(storm);
    }, 280);
    setTimeout(showWinCard, 2500);
    G.saveNow();
  });

  // `won` is only saved once the win card has actually been shown, so reloading during
  // the celebration still shows it on the next boot.
  function showWinCard() {
    if (G.state.won) return;
    G.state.won = true;
    G.hud.showWin({ time: G.state.playTime, earned: G.state.earned, next: nextInfo() });
    G.events.emit('level:won', { world: G.worldId, next: nextInfo() });
    G.saveNow();
  }
  if (G.stats.won) {
    finish();                                      // e.g. a migrated save that had already won
    if (!G.state.won) setTimeout(showWinCard, 1200);
  }

  return { finish, showWinCard, nextInfo };
}
