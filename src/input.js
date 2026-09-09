// standup-shark Input: keyboard (arrows / W-S) + touch swipe -> {up, down}
// intent. Browser-only.
//
// Touch model: drag-and-hold. Put a finger on the canvas; the touch's
// starting Y is the anchor. Drag the finger UP past the deadzone -> up
// stays true while the finger is above the anchor. Drag DOWN past the
// deadzone -> down stays true. Release -> both off. Mirrors how the
// keyboard behaves (hold arrow to keep steering).

const TOUCH_DEADZONE_PX = 12;

export const Input = {
  _keys: { up: false, down: false },
  _touch: { active: false, startY: 0 },
  _canvas: null,

  attach(canvas) {
    window.addEventListener("keydown", Input._onKey, { passive: false });
    window.addEventListener("keyup", Input._onKey, { passive: false });
    if (canvas) {
      Input._canvas = canvas;
      canvas.addEventListener("touchstart",  Input._onTouchStart,  { passive: false });
      canvas.addEventListener("touchmove",   Input._onTouchMove,   { passive: false });
      canvas.addEventListener("touchend",    Input._onTouchEnd,    { passive: false });
      canvas.addEventListener("touchcancel", Input._onTouchEnd,    { passive: false });
    }
  },
  detach() {
    window.removeEventListener("keydown", Input._onKey);
    window.removeEventListener("keyup", Input._onKey);
    const c = Input._canvas;
    if (c) {
      c.removeEventListener("touchstart",  Input._onTouchStart);
      c.removeEventListener("touchmove",   Input._onTouchMove);
      c.removeEventListener("touchend",    Input._onTouchEnd);
      c.removeEventListener("touchcancel", Input._onTouchEnd);
      Input._canvas = null;
    }
    Input.reset();
  },

  _onKey(e) {
    const down = e.type === "keydown";
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { Input._keys.up = down; e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { Input._keys.down = down; e.preventDefault(); }
  },

  _onTouchStart(e) {
    // Only the first touch point matters - multi-finger gestures are ignored.
    const t = e.touches[0];
    if (!t) return;
    Input._touch.active = true;
    Input._touch.startY = t.clientY;
    Input._keys.up = false;
    Input._keys.down = false;
    e.preventDefault();
  },
  _onTouchMove(e) {
    if (!Input._touch.active) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - Input._touch.startY;
    if (dy < -TOUCH_DEADZONE_PX) { Input._keys.up = true;  Input._keys.down = false; }
    else if (dy > TOUCH_DEADZONE_PX) { Input._keys.up = false; Input._keys.down = true; }
    else { Input._keys.up = false; Input._keys.down = false; }
    e.preventDefault();
  },
  _onTouchEnd(e) {
    Input._touch.active = false;
    Input._keys.up = false;
    Input._keys.down = false;
    e.preventDefault();
  },

  intent() { return { up: Input._keys.up, down: Input._keys.down }; },
  reset() {
    Input._keys.up = false;
    Input._keys.down = false;
    Input._touch.active = false;
  }
};
