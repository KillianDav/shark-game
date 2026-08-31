// standup-shark Input: keyboard (arrows / W-S) -> {up, down} intent. Browser-only.

export const Input = {
  _keys: { up: false, down: false },
  attach() {
    window.addEventListener("keydown", Input._onKey, { passive: false });
    window.addEventListener("keyup", Input._onKey, { passive: false });
  },
  detach() {
    window.removeEventListener("keydown", Input._onKey);
    window.removeEventListener("keyup", Input._onKey);
  },
  _onKey(e) {
    const down = e.type === "keydown";
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { Input._keys.up = down; e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { Input._keys.down = down; e.preventDefault(); }
  },
  intent() { return { up: Input._keys.up, down: Input._keys.down }; },
  reset() { Input._keys.up = false; Input._keys.down = false; }
};
