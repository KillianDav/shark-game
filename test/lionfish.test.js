// Lionfish: fan of spikes; only the small hazard TIPS kill. Body is safe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function stateWithOneLionfish(overrides = {}) {
  const s = Sim.createState({ seed: 1, mode: 'solo', players: [{ id: 0, name: 'A' }] });
  s.spawnTimer = 1e6;
  s.octopusSpawnTimer = 1e6;
  s.lionfishSpawnTimer = 1e6;
  s.anchorSpawnTimer = 1e6;
  s.players[0].lives = 1;
  s.lionfish = [{
    id: 1, x: 800, y: 500, baseY: 500, swimT: 0, wavePhase: 0,
    vx: 0, scale: 1.1,
    ...overrides
  }];
  return s;
}

test('lionfish kill zone is at the spike TIPS', () => {
  const s = stateWithOneLionfish();
  const f = s.lionfish[0];
  const tip = Sim._lionfishTip(f, 2);
  s.players[0].x = tip.x;
  s.players[0].y = tip.y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[0].deathKind, 'lionfish');
});

test('lionfish body centre is safe to touch', () => {
  const s = stateWithOneLionfish();
  const f = s.lionfish[0];
  s.players[0].x = f.x;
  s.players[0].y = f.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
});

test('sharks-only mode never spawns octopus or lionfish', () => {
  const s = Sim.createState({
    seed: 1, mode: 'party', hazards: 'sharks-only', lives: 20,
    players: Array.from({ length: 6 }, (_, i) => ({ id: i, name: 'B' + i, isBot: true }))
  });
  let peakO = 0, peakL = 0;
  for (let i = 0; i < 60 * 60; i++) {
    Sim.step(s, {}, 1 / 60);
    peakO = Math.max(peakO, s.octopuses.length);
    peakL = Math.max(peakL, s.lionfish.length);
    if (s.status === 'over') break;
  }
  assert.equal(peakO, 0);
  assert.equal(peakL, 0);
});
