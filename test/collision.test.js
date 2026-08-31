// Pin the bite-ellipse boundary. Only the mouth (front of the shark) kills;
// the tail-side of a shark is safe to touch. Documents the current behaviour
// so silent regressions in the collision math trip the suite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function stateWithOneShark(sharkOverrides = {}) {
  const state = Sim.createState({
    seed: 1,
    mode: 'solo',
    players: [{ id: 0, name: 'A', isBot: false }]
  });
  state.spawnTimer = 1e6;   // suppress spawning during the test
  const scale = 1.6;
  state.sharks = [{
    id: 1,
    x: 800, y: 400, baseY: 400, swimT: 0,
    waveAmp: 0, waveFreq: 0, wavePhase: 0,   // flat trajectory
    vx: 0, bob: 0, scale,
    rx: CFG.shark.hitRX * scale,
    ry: CFG.shark.hitRY * scale,
    chomp: 0,
    laser: { state: 'idle', timer: 1e6, y: 400 },
    ...sharkOverrides
  }];
  return state;
}

test('shark bites a player at the mouth boundary (p.x == mouthStart)', () => {
  const s = stateWithOneShark();
  const shark = s.sharks[0];
  const mouthStart = shark.x - CFG.shark.mouthStartX * shark.scale;
  s.players[0].x = mouthStart;      // exactly at the mouth line
  s.players[0].y = shark.y;         // dead-centre of the ellipse in Y
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false, 'player at the mouth line should be eaten');
  assert.equal(s.players[0].deathKind, 'eaten');
});

test('shark does NOT bite a player behind the mouth line (tail side)', () => {
  const s = stateWithOneShark();
  const shark = s.sharks[0];
  const mouthStart = shark.x - CFG.shark.mouthStartX * shark.scale;
  s.players[0].x = mouthStart + 1;  // just behind the mouth
  s.players[0].y = shark.y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true, 'player behind the mouth line is safe');
});

test('shark does NOT bite when player is outside the ellipse in Y', () => {
  const s = stateWithOneShark();
  const shark = s.sharks[0];
  const mouthStart = shark.x - CFG.shark.mouthStartX * shark.scale;
  s.players[0].x = mouthStart;
  s.players[0].y = shark.y + shark.ry + CFG.player.ry + 5;   // beyond the ellipse
  s.players[0].vy = 0;
  // pin the player in place so movement doesn't drift them
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true, 'player well outside the ellipse should not be bitten');
});

test('laser kills a player in the beam lane while firing', () => {
  const s = stateWithOneShark({ laser: { state: 'firing', timer: 0.5, y: 400 } });
  const shark = s.sharks[0];
  const eye = Sim._eye(shark);
  s.players[0].x = eye.x - 200;     // in the beam's leftward range
  s.players[0].y = eye.y;           // dead-centre of the beam
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false, 'player in beam lane should be lasered');
  assert.equal(s.players[0].deathKind, 'laser');
});

test('laser does NOT kill a player outside the beam band', () => {
  const s = stateWithOneShark({ laser: { state: 'firing', timer: 0.5, y: 400 } });
  const shark = s.sharks[0];
  const eye = Sim._eye(shark);
  s.players[0].x = eye.x - 200;
  s.players[0].y = eye.y + CFG.shark.laserBand + CFG.player.ry + 5;   // outside the band
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true, 'player well outside the beam band should survive');
});
