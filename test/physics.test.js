// Player vertical physics: up/down input applies acceleration, damping decays
// vy when no input, position clamps at the water boundaries. Speed scales with
// the shared tempo multiplier, matching the sharks so dodging stays feasible.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function soloState() {
  const s = Sim.createState({
    seed: 1,
    mode: 'solo',
    players: [{ id: 0, name: 'A', isBot: false }]
  });
  s.spawnTimer = 1e6;
  s.sharks = [];
  return s;
}

test('holding down increases y (moves toward the seabed)', () => {
  const s = soloState();
  const startY = s.players[0].y;
  for (let i = 0; i < 30; i++) Sim.step(s, { 0: { up: 0, down: 1 } }, 1 / 60);
  assert.ok(s.players[0].y > startY, 'player should have descended');
});

test('holding up decreases y (moves toward the surface)', () => {
  const s = soloState();
  const startY = s.players[0].y;
  for (let i = 0; i < 30; i++) Sim.step(s, { 0: { up: 1, down: 0 } }, 1 / 60);
  assert.ok(s.players[0].y < startY, 'player should have risen');
});

test('player clamps at the water surface (top)', () => {
  const s = soloState();
  s.players[0].y = CFG.world.waterTop + CFG.player.ry;
  s.players[0].vy = -1000;   // slam upward
  Sim.step(s, { 0: { up: 1, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].y, CFG.world.waterTop + CFG.player.ry, 'clamped at surface');
  assert.equal(s.players[0].vy, 0, 'vertical velocity zeroed at boundary');
});

test('player clamps at the seabed (bottom)', () => {
  const s = soloState();
  s.players[0].y = CFG.world.waterBottom - CFG.player.ry;
  s.players[0].vy = 1000;
  Sim.step(s, { 0: { up: 0, down: 1 } }, 1 / 60);
  assert.equal(s.players[0].y, CFG.world.waterBottom - CFG.player.ry);
  assert.equal(s.players[0].vy, 0);
});

test('no input applies damping toward vy = 0', () => {
  const s = soloState();
  s.players[0].vy = 200;
  const before = Math.abs(s.players[0].vy);
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  const after = Math.abs(s.players[0].vy);
  assert.ok(after < before, `damping should reduce |vy|: ${before} -> ${after}`);
});
