// Anchors: fall straight down through the water. Kill ONLY on direct
// body-overlap - a near-miss to the side passes harmlessly. Bots try to
// dodge one falling near their x.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function stateWithOneAnchor(overrides = {}) {
  const s = Sim.createState({
    seed: 1,
    mode: 'solo',
    players: [{ id: 0, name: 'A', isBot: false }]
  });
  s.spawnTimer = 1e6;
  s.anchorSpawnTimer = 1e6;
  s.players[0].lives = 1;   // one-shot so a single hit resolves the assertion
  s.anchors = [{
    id: 1,
    x: s.players[0].x,     // directly over the player
    y: s.players[0].y,     // right on the player
    vy: 0,                 // freeze the fall so the step doesn't move it
    scale: 1.3,
    splash: 0,
    ...overrides
  }];
  return s;
}

test('anchor kills a player it overlaps directly', () => {
  const s = stateWithOneAnchor();
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[0].deathKind, 'anchor');
});

test('anchor does NOT kill a player 60px to the side', () => {
  const s = stateWithOneAnchor();
  const a = s.anchors[0];
  a.x = s.players[0].x + 60;   // clean miss horizontally
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
});

test('anchor falls, embeds in the seabed, then culls after the linger', () => {
  const s = Sim.createState({
    seed: 1, mode: 'solo',
    players: [{ id: 0, name: 'A', isBot: false }]
  });
  s.spawnTimer = 1e6;
  s.anchorSpawnTimer = 1e6;
  s.anchors = [{ id: 1, x: 900, y: 100, vy: 200, scale: 1.3, splash: 0, embedded: false, embeddedT: 0 }];
  const startY = s.anchors[0].y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.ok(s.anchors[0].y > startY, 'anchor should have fallen further down');
  // Fast-forward until it embeds
  for (let i = 0; i < 300; i++) {
    Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
    if (s.anchors.length && s.anchors[0].embedded) break;
  }
  assert.equal(s.anchors.length, 1, 'anchor should still be present, embedded');
  assert.equal(s.anchors[0].embedded, true, 'anchor should be embedded in the seabed');
  assert.equal(s.anchors[0].vy, 0, 'embedded anchor should not fall further');
  // Continue past the linger duration
  for (let i = 0; i < 60 * 5; i++) Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.anchors.length, 0, 'anchor should be culled after the embedded linger');
});

test('only one boat is on screen at a time', () => {
  const s = Sim.createState({
    seed: 1, mode: 'party', lives: 20,
    players: Array.from({ length: 4 }, (_, i) => ({ id: i, name: 'B' + i, isBot: true }))
  });
  s.diff.anchor.earliestT = 0;
  s.anchorSpawnTimer = 0.1;
  let peakBoats = 0;
  for (let i = 0; i < 60 * 40; i++) {
    Sim.step(s, {}, 1 / 60);
    peakBoats = Math.max(peakBoats, s.boats.length);
    if (s.status === 'over') break;
  }
  assert.ok(peakBoats <= 1, `should never exceed 1 boat, saw peak of ${peakBoats}`);
});

test('boat moors (stops moving) after dropping its anchor', () => {
  const s = Sim.createState({
    seed: 1, mode: 'solo',
    players: [{ id: 0, name: 'A', isBot: false }]
  });
  s.spawnTimer = 1e6;
  s.anchorSpawnTimer = 1e6;
  s.boats = [{
    id: 1, x: 640, y: CFG.world.waterTop, vx: -50, targetX: 640,
    state: 'approaching', moorTimer: 0, scale: 1
  }];
  // First step should trigger the drop and switch to moored.
  Sim.step(s, {}, 1 / 60);
  assert.equal(s.boats[0].state, 'moored');
  assert.equal(s.anchors.length, 1);
  const xAtMoor = s.boats[0].x;
  // A few frames later - boat should not have moved.
  for (let i = 0; i < 30; i++) Sim.step(s, {}, 1 / 60);
  assert.equal(s.boats[0].x, xAtMoor, 'moored boat should not drift');
  // After the moor duration - boat should start leaving.
  for (let i = 0; i < 60 * 5; i++) {
    Sim.step(s, {}, 1 / 60);
    if (s.boats.length && s.boats[0].state === 'leaving') break;
  }
  if (s.boats.length) assert.equal(s.boats[0].state, 'leaving', 'boat should drift off after mooring');
});

test('bot dodges an anchor incoming near its x', () => {
  const s = Sim.createState({
    seed: 1, mode: 'party',
    players: [
      { id: 0, name: 'A', isBot: false },
      { id: 1, name: 'B', isBot: true }
    ]
  });
  const bot = s.players[1];
  bot.y = 400;
  bot.botBias = 0;
  bot.botReact = 1;
  s.spawnTimer = 1e6;
  s.sharks = [];
  s.stingrays = [];
  s.anchors = [{ id: 1, x: bot.x + 5, y: bot.y - 200, vy: 180, scale: 1.3, splash: 0 }];
  const intent = Sim._botIntent(s, bot);
  assert.ok(intent.up !== intent.down, `bot should pick a direction, got up=${intent.up} down=${intent.down}`);
});
