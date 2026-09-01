// Blue-ringed octopus: 8 tentacles, only the blue-ring TIP circles kill.
// Mantle body is safe to touch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function stateWithOneOctopus(overrides = {}) {
  const s = Sim.createState({ seed: 1, mode: 'solo', players: [{ id: 0, name: 'A' }] });
  // Suppress all organic spawns.
  s.spawnTimer = 1e6;
  s.octopusSpawnTimer = 1e6;
  s.lionfishSpawnTimer = 1e6;
  s.anchorSpawnTimer = 1e6;
  s.players[0].lives = 1;
  s.octopuses = [{
    id: 1, x: 800, y: 400, baseY: 400, swimT: 0, wavePhase: 0,
    vx: 0, scale: 1.1,
    ...overrides
  }];
  return s;
}

test('octopus kill zone is at the tentacle TIPS', () => {
  const s = stateWithOneOctopus();
  const o = s.octopuses[0];
  const tip = Sim._octopusTip(o, 0);
  s.players[0].x = tip.x;
  s.players[0].y = tip.y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[0].deathKind, 'octopus');
});

test('octopus MANTLE (body centre) is safe to touch', () => {
  const s = stateWithOneOctopus();
  const o = s.octopuses[0];
  s.players[0].x = o.x;   // sitting on the octopus centre
  s.players[0].y = o.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true, 'the mantle body should not kill');
});

test('_octopusTip is deterministic (same input -> same output)', () => {
  const s = stateWithOneOctopus();
  const o = s.octopuses[0];
  const a = Sim._octopusTip(o, 3);
  const b = Sim._octopusTip(o, 3);
  assert.equal(a.x, b.x);
  assert.equal(a.y, b.y);
});

test('there are CFG.octopus.tentacles distinct tip positions', () => {
  const s = stateWithOneOctopus();
  const o = s.octopuses[0];
  const xs = new Set();
  for (let i = 0; i < CFG.octopus.tentacles; i++) {
    const tip = Sim._octopusTip(o, i);
    xs.add(tip.x.toFixed(3) + ',' + tip.y.toFixed(3));
  }
  assert.equal(xs.size, CFG.octopus.tentacles);
});
