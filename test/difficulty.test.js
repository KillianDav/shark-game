// Difficulty ramp + shared tempo multiplier + spawn interval math.
// These knobs shape the whole feel of the game; regressions here silently
// make the game too easy or too hard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

test('_difficulty starts at 0 and reaches 1 at rampTime', () => {
  assert.equal(Sim._difficulty(0), 0);
  const atRamp = Sim._difficulty(CFG.shark.rampTime);
  assert.ok(Math.abs(atRamp - 1) < 1e-9, `expected ~1 at rampTime, got ${atRamp}`);
  assert.equal(Sim._difficulty(CFG.shark.rampTime * 10), 1, 'clamped at 1 beyond rampTime');
});

test('_difficulty is monotonically increasing over the ramp', () => {
  let prev = -1;
  for (let t = 0; t <= CFG.shark.rampTime; t += 0.5) {
    const d = Sim._difficulty(t);
    assert.ok(d >= prev, `not monotonic at t=${t}: ${prev} -> ${d}`);
    prev = d;
  }
});

test('_speedMul: 1 at t=0, monotonic, capped at speedMax', () => {
  assert.equal(Sim._speedMul(0), 1);
  assert.ok(Sim._speedMul(30) > Sim._speedMul(0));
  assert.equal(Sim._speedMul(1e6), CFG.progression.speedMax, 'clamped at speedMax');
});

test('_spawnInterval: starts at spawnStart, ends at spawnMin', () => {
  const S = CFG.shark;
  assert.ok(Math.abs(Sim._spawnInterval(0) - S.spawnStart) < 1e-9);
  const late = Sim._spawnInterval(S.rampTime * 5);
  assert.ok(Math.abs(late - S.spawnMin) < 1e-9, `late spawn interval should hit spawnMin (${S.spawnMin}), got ${late}`);
  assert.ok(Sim._spawnInterval(0) > Sim._spawnInterval(S.rampTime / 2), 'spawn interval shrinks with time');
});
