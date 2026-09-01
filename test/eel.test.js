// Electric eel: only the BUZZ (active state) kills, inside a circle around
// the body. Body itself is safe when idle or winding up.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function stateWithOneEel(buzzState = 'active') {
  const s = Sim.createState({ seed: 1, mode: 'solo', players: [{ id: 0, name: 'A' }] });
  s.spawnTimer = 1e6;
  s.octopusSpawnTimer = 1e6;
  s.lionfishSpawnTimer = 1e6;
  s.eelSpawnTimer = 1e6;
  s.anchorSpawnTimer = 1e6;
  s.players[0].lives = 1;
  s.eels = [{
    id: 1, x: 800, y: 400, baseY: 400, swimT: 0,
    waveAmp: 0, waveFreq: 0, wavePhase: 0,
    vx: 0, scale: 1.0,
    buzz: { state: buzzState, timer: 1.0 }
  }];
  return s;
}

test('eel buzz kills a player inside the buzz radius', () => {
  const s = stateWithOneEel('active');
  const el = s.eels[0];
  s.players[0].x = el.x;
  s.players[0].y = el.y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[0].deathKind, 'electric');
});

test('eel body is safe to touch during IDLE state (no buzz)', () => {
  const s = stateWithOneEel('idle');
  const el = s.eels[0];
  s.players[0].x = el.x;
  s.players[0].y = el.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
});

test('eel body is safe during WINDUP (only ACTIVE kills)', () => {
  const s = stateWithOneEel('windup');
  const el = s.eels[0];
  s.players[0].x = el.x;
  s.players[0].y = el.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
});

test('eel buzz misses a player well outside buzzR', () => {
  const s = stateWithOneEel('active');
  const el = s.eels[0];
  s.players[0].x = el.x + CFG.electricEel.buzzR + CFG.player.rx + 20;
  s.players[0].y = el.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
});

test('sharks-only mode never spawns eels', () => {
  const s = Sim.createState({
    seed: 1, mode: 'party', hazards: 'sharks-only', lives: 20,
    players: Array.from({ length: 4 }, (_, i) => ({ id: i, name: 'B' + i, isBot: true }))
  });
  let peak = 0;
  for (let i = 0; i < 60 * 60; i++) {
    Sim.step(s, {}, 1 / 60);
    peak = Math.max(peak, s.eels.length);
    if (s.status === 'over') break;
  }
  assert.equal(peak, 0);
});
