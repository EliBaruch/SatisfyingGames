// Moving items between the world, stacks and stations with a flying animation.
// Allocation-free: shared option objects, pre-built landing callbacks, and the target
// passed through fx.fly's `data`. Used by the player, workers and stations alike.
//
//   flyToStack(G, stack, kind, x, y, z, delay)  item appears at (x,y,z) and lands on top of `stack`
//                                               (counts in stack.incoming until it lands)
//   flyToDrop(G, stack, station, kind, delay)   item leaves the top of `stack` (already popped by
//                                               the caller) and lands in station.drop
//
// A stack may set `stack.onLand = (kind) => {}` (e.g. to play a sound) and a station's
// drop capability may set `sound: { volume, pos }` for the landing sound.
import * as THREE from 'three';

const _from = new THREE.Vector3();
const stackTop = (out, stack) => stack.topWorld(out);
function landOnStack(stack, kind) {
  stack.incoming = Math.max(0, stack.incoming - 1);
  stack.push(kind);
  if (stack.onLand) stack.onLand(kind);
}
const dropTarget = (out, station) => station.drop.target(out);

let audioRef = null;
const dropSounds = new WeakMap();
function landInDrop(station, kind) {
  station.drop.give(kind);
  if (audioRef && audioRef.play) {
    let snd = station.drop.sound || dropSounds.get(station);
    if (!snd) { snd = { volume: 0.7, pos: station.drop.face || station.pos }; dropSounds.set(station, snd); }
    audioRef.play('drop', snd);
  }
}

const stackOpts = { kind: '', from: _from, to: stackTop, dur: 0.3, arc: 1.4, delay: 0, onDone: landOnStack, data: null };
const dropOpts = { kind: '', from: _from, to: dropTarget, dur: 0.3, arc: 1.5, delay: 0, onDone: landInDrop, data: null };

export function flyToStack(G, stack, kind, x, y, z, delay = 0) {
  stack.incoming++;
  const fx = G.fx;
  if (!fx || !fx.fly) { landOnStack(stack, kind); return; }
  _from.set(x, y, z);
  stackOpts.kind = kind;
  stackOpts.data = stack;
  stackOpts.dur = 0.25 + Math.random() * 0.1;
  stackOpts.arc = 1.3 + Math.random() * 0.3;
  stackOpts.delay = delay;
  fx.fly(stackOpts);
}

export function flyToDrop(G, stack, station, kind, delay = 0) {
  audioRef = G.audio;
  station.drop.expect(kind);
  const fx = G.fx;
  if (!fx || !fx.fly) { landInDrop(station, kind); return; }
  stack.topWorld(_from);
  dropOpts.kind = kind;
  dropOpts.data = station;
  dropOpts.dur = 0.28 + Math.random() * 0.06;
  dropOpts.delay = delay;
  fx.fly(dropOpts);
}

/** Fly an item from a world point into a stack (e.g. taken from a pickup zone). */
export function flyFromPoint(G, stack, kind, from, delay = 0) {
  flyToStack(G, stack, kind, from.x, from.y, from.z, delay);
}

/** Squared distance test: is (x, z) inside zone {x, z, r} (+ extra margin)? */
export function inZone(zone, x, z, extra = 0) {
  const dx = x - zone.x, dz = z - zone.z, r = zone.r + extra;
  return dx * dx + dz * dz <= r * r;
}
