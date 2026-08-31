// Pin the shark kill-zone: only the TEETH kill (a small circle at the front
// of the head). The body / back / tail are safe to touch so passing through
// the tail of a shark that's crossing the lane does not count as a bite.
// Laser is separate - only the visible beam kills.

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
    chomp: 0,
    laser: { state: 'idle', timer: 1e6, y: 400 },
    ...sharkOverrides
  }];
  return state;
}
// Approximate sprite half-width for tests that need "well behind the tail".
const SHARK_BODY_HALF = 26;   // matches the ellipse rx used in Render.drawSharkSprite

test('shark bites a player centred on the teeth', () => {
  const s = stateWithOneShark();
  const shark = s.sharks[0];
  const teethX = shark.x - CFG.shark.teethOffsetX * shark.scale;
  s.players[0].x = teethX;
  s.players[0].y = shark.y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false, 'player on the teeth should be eaten');
  assert.equal(s.players[0].deathKind, 'eaten');
});

test('shark does NOT bite when the player is touching the shark BODY (behind the teeth)', () => {
  // Body kill zone used to include the whole ellipse; this test pins the fix.
  const s = stateWithOneShark();
  const shark = s.sharks[0];
  s.players[0].x = shark.x;             // dead-centre of the shark body
  s.players[0].y = shark.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true, 'the shark body should be safe to touch');
});

test('shark does NOT bite from behind the tail', () => {
  const s = stateWithOneShark();
  const shark = s.sharks[0];
  s.players[0].x = shark.x + SHARK_BODY_HALF * shark.scale + CFG.player.rx + 5;
  s.players[0].y = shark.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
});

test('shark does NOT bite when player is outside the teeth radius in Y', () => {
  const s = stateWithOneShark();
  const shark = s.sharks[0];
  const teethX = shark.x - CFG.shark.teethOffsetX * shark.scale;
  s.players[0].x = teethX;
  // A player rx worth of margin plus a bit clears the teeth circle vertically.
  s.players[0].y = shark.y + CFG.player.ry + CFG.shark.teethR * shark.scale + 15;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
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
