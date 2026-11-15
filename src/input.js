// Pointer (floating joystick) and keyboard input. Produces G.input = { x, y, active, override, update() }.
// x / y are screen-space: x right, y UP, magnitude 0..1.

const DEAD_ZONE = 6;   // px
const FULL_THROW = 60; // px

export function createInput(G) {
  const canvas = document.getElementById('game');
  const joyBase = document.getElementById('joy-base');
  const joyKnob = document.getElementById('joy-knob');

  const input = { x: 0, y: 0, active: false, override: null, update };

  let pid = null;          // the one pointer that drives the joystick
  let ox = 0, oy = 0;      // joystick base (client px)
  let px = 0, py = 0;      // pointer output (y up)
  let pActive = false;
  const keys = { l: false, r: false, u: false, d: false };

  function showJoy(on) {
    joyBase.classList.toggle('on', on);
    joyKnob.classList.toggle('on', on);
  }

  function placeKnob(kx, ky) {
    joyKnob.style.transform = `translate(calc(-50% + ${kx}px), calc(-50% + ${ky}px))`;
  }

  function onDown(e) {
    if (pid !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pid = e.pointerId;
    try { canvas.setPointerCapture(pid); } catch (_) { /* ignore */ }
    ox = e.clientX;
    oy = e.clientY;
    joyBase.style.left = ox + 'px';
    joyBase.style.top = oy + 'px';
    joyKnob.style.left = ox + 'px';
    joyKnob.style.top = oy + 'px';
    placeKnob(0, 0);
    showJoy(true);
    setFromPointer(e.clientX, e.clientY);
  }

  function onMove(e) {
    if (e.pointerId !== pid) return;
    setFromPointer(e.clientX, e.clientY);
  }

  function onUp(e) {
    if (e.pointerId !== pid) return;
    try { canvas.releasePointerCapture(pid); } catch (_) { /* ignore */ }
    pid = null;
    px = 0;
    py = 0;
    pActive = false;
    showJoy(false);
  }

  function setFromPointer(cx, cy) {
    const dx = cx - ox;
    const dy = cy - oy;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const shown = Math.min(dist, FULL_THROW);
      placeKnob((dx / dist) * shown, (dy / dist) * shown);
      const mag = dist < DEAD_ZONE ? 0 : Math.min(dist / FULL_THROW, 1);
      px = (dx / dist) * mag;
      py = -(dy / dist) * mag; // screen dy is down-positive, output y is up-positive
      pActive = mag > 0;
    } else {
      px = 0;
      py = 0;
      pActive = false;
    }
  }

  function setKey(code, down) {
    switch (code) {
      case 'KeyA': case 'ArrowLeft': keys.l = down; return true;
      case 'KeyD': case 'ArrowRight': keys.r = down; return true;
      case 'KeyW': case 'ArrowUp': keys.u = down; return true;
      case 'KeyS': case 'ArrowDown': keys.d = down; return true;
      default: return false;
    }
  }

  function onKeyDown(e) {
    if (setKey(e.code, true) && e.code.startsWith('Arrow')) e.preventDefault();
  }

  function onKeyUp(e) {
    setKey(e.code, false);
  }

  function onBlur() {
    keys.l = keys.r = keys.u = keys.d = false;
  }

  function keyVector() {
    let kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0);
    let ky = (keys.u ? 1 : 0) - (keys.d ? 1 : 0);
    const len = Math.hypot(kx, ky);
    if (len > 1) { kx /= len; ky /= len; }
    return [kx, ky];
  }

  function update() {
    const o = input.override;
    if (o && typeof o.x === 'number' && typeof o.y === 'number') {
      input.x = o.x;
      input.y = o.y;
      input.active = Math.hypot(o.x, o.y) > 0;
      return;
    }
    if (pid !== null) {
      input.x = px;
      input.y = py;
      input.active = pActive;
      return;
    }
    const [kx, ky] = keyVector();
    input.x = kx;
    input.y = ky;
    input.active = kx !== 0 || ky !== 0;
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('lostpointercapture', onUp);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  // Keep the page from scrolling, zooming or opening menus on gestures.
  const block = (e) => e.preventDefault();
  window.addEventListener('touchmove', block, { passive: false });
  window.addEventListener('contextmenu', block);
  window.addEventListener('gesturestart', block, { passive: false });

  return input;
}
