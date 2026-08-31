// Bot dodge logic: bots steer away from the nearest shark ahead + in range.
// A bot with no shark in range should not have a strong up/down preference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function botAt(y) {
  const s = Sim.createState({
    seed: 1,
    mode: 'party',
    players: [
      { id: 0, name: 'A', isBot: false },
      { id: 1, name: 'B', isBot: true }
    ]
  });
  const bot = s.players[1];
  bot.y = y;
  bot.botBias = 0;         // remove personality bias so direction is deterministic
  bot.botReact = 1;        // full detection range
  s.spawnTimer = 1e6;
  s.sharks = [];
  return { s, bot };
}

test('bot below a nearby shark ahead steers down (away)', () => {
  const { s, bot } = botAt(500);
  s.sharks.push({
    id: 1, x: bot.x + 150, y: 300,
    baseY: 300, swimT: 0, waveAmp: 0, waveFreq: 0, wavePhase: 0,
    vx: 0, bob: 0, scale: 1.6,
    rx: 30, ry: 15, chomp: 0,
    laser: { state: 'idle', timer: 1e6, y: 300 }
  });
  const intent = Sim._botIntent(s, bot);
  assert.equal(intent.down, true);
  assert.equal(intent.up, false);
});

test('bot above a nearby shark ahead steers up (away)', () => {
  const { s, bot } = botAt(200);
  s.sharks.push({
    id: 1, x: bot.x + 150, y: 400,
    baseY: 400, swimT: 0, waveAmp: 0, waveFreq: 0, wavePhase: 0,
    vx: 0, bob: 0, scale: 1.6,
    rx: 30, ry: 15, chomp: 0,
    laser: { state: 'idle', timer: 1e6, y: 400 }
  });
  const intent = Sim._botIntent(s, bot);
  assert.equal(intent.up, true);
  assert.equal(intent.down, false);
});

test('bot with no shark in range does not chase phantom threats', () => {
  const { s, bot } = botAt(400);
  // no sharks at all
  const intent = Sim._botIntent(s, bot);
  assert.ok(intent.up === false || intent.down === false, 'a bot with no threat should not press both');
});
