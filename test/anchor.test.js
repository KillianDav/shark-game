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

test('anchor moves downward each tick and is culled below the world', () => {
  const s = Sim.createState({
    seed: 1, mode: 'solo',
    players: [{ id: 0, name: 'A', isBot: false }]
  });
  s.spawnTimer = 1e6;
  s.anchorSpawnTimer = 1e6;
  s.anchors = [{ id: 1, x: 900, y: 100, vy: 200, scale: 1.3, splash: 0 }];
  const startY = s.anchors[0].y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.ok(s.anchors[0].y > startY, 'anchor should have fallen further down');
  // Fast-forward a few seconds - anchor should get culled once past the world.
  for (let i = 0; i < 300; i++) Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.anchors.length, 0, 'anchor past waterBottom should be culled');
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
