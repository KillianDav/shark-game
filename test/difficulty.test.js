// Difficulty ramp + shared tempo multiplier + spawn interval math.
// These knobs shape the whole feel of the game; regressions here silently
// make the game too easy or too hard. Helpers read from state.diff so the
// test creates a real state at each difficulty to exercise the presets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, DIFFICULTIES, Sim } from '../src/sim.js';

const mkState = (difficulty = 'medium') =>
  Sim.createState({ seed: 1, mode: 'solo', difficulty, players: [{ name: 'A' }] });

test('_difficulty starts at 0 and reaches 1 at rampTime (medium)', () => {
  const s = mkState('medium');
  assert.equal(Sim._difficulty(s, 0), 0);
  const atRamp = Sim._difficulty(s, s.diff.shark.rampTime);
  assert.ok(Math.abs(atRamp - 1) < 1e-9, `expected ~1 at rampTime, got ${atRamp}`);
  assert.equal(Sim._difficulty(s, s.diff.shark.rampTime * 10), 1, 'clamped at 1 beyond rampTime');
});

test('_difficulty is monotonically increasing over the ramp', () => {
  const s = mkState('medium');
  let prev = -1;
  for (let t = 0; t <= s.diff.shark.rampTime; t += 0.5) {
    const d = Sim._difficulty(s, t);
    assert.ok(d >= prev, `not monotonic at t=${t}: ${prev} -> ${d}`);
    prev = d;
  }
});

test('_speedMul: 1 at t=0, monotonic, capped at speedMax', () => {
  const s = mkState('medium');
  assert.equal(Sim._speedMul(s, 0), 1);
  assert.ok(Sim._speedMul(s, 30) > Sim._speedMul(s, 0));
  assert.equal(Sim._speedMul(s, 1e6), s.diff.progression.speedMax, 'clamped at speedMax');
});

test('_spawnInterval: starts at spawnStart, ends at spawnMin', () => {
  const s = mkState('medium');
  const S = s.diff.shark;
  assert.ok(Math.abs(Sim._spawnInterval(s, 0) - S.spawnStart) < 1e-9);
  const late = Sim._spawnInterval(s, S.rampTime * 5);
  assert.ok(Math.abs(late - S.spawnMin) < 1e-9, `late spawn interval should hit spawnMin (${S.spawnMin}), got ${late}`);
  assert.ok(Sim._spawnInterval(s, 0) > Sim._spawnInterval(s, S.rampTime / 2), 'spawn interval shrinks with time');
});

test('DIFFICULTIES presets get harder as you go easy -> medium -> fiendish', () => {
  const easy = mkState('easy'), med = mkState('medium'), hard = mkState('fiendish');
  // Faster spawn cadence at the end of the ramp
  assert.ok(easy.diff.shark.spawnMin > med.diff.shark.spawnMin, 'easy spawns slower than medium');
  assert.ok(med.diff.shark.spawnMin > hard.diff.shark.spawnMin, 'medium spawns slower than fiendish');
  // Higher tempo ceiling
  assert.ok(easy.diff.progression.speedMax < med.diff.progression.speedMax);
  assert.ok(med.diff.progression.speedMax < hard.diff.progression.speedMax);
  // More aggressive lasers
  assert.ok(easy.diff.shark.laserChance < med.diff.shark.laserChance);
  assert.ok(med.diff.shark.laserChance < hard.diff.shark.laserChance);
});

test('unknown difficulty falls back to medium (matches CFG defaults)', () => {
  const s = mkState('nonsense');
  assert.equal(s.difficulty, 'medium');
  assert.equal(s.diff.shark.spawnStart, CFG.shark.spawnStart);
});

test('DIFFICULTIES table is exported with the expected keys', () => {
  assert.ok(DIFFICULTIES.easy && DIFFICULTIES.medium && DIFFICULTIES.fiendish, 'three named presets');
  assert.equal(Object.keys(DIFFICULTIES.medium).length, 1, 'medium is label-only (empty overrides)');
});
