// Stingrays: a low-frequency seabed hazard that stings with a telegraphed
// tail whip. Body is safe to touch; only the tail tip during the active phase
// kills. A "sharks-only" hazards mode disables ray spawns entirely.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

function stateWithOneRay(overrides = {}) {
  const s = Sim.createState({
    seed: 1,
    mode: 'solo',
    players: [{ id: 0, name: 'A', isBot: false }]
  });
  s.spawnTimer = 1e6;   // no organic spawns
  s.players[0].lives = 1;   // one-shot so a single strike resolves the assertion
  const scale = 1.3;
  s.stingrays = [{
    id: 1,
    x: 500, y: 620, baseY: 620, swimT: 0,
    waveAmp: 0, waveFreq: 0, wavePhase: 0,
    vx: 0, scale,
    sting: { state: 'idle', timer: 1e6, x: 0, y: 0 },
    ...overrides
  }];
  return s;
}

test('tail-strike active kills a player within stingReach of the tip', () => {
  const s = stateWithOneRay();
  const r = s.stingrays[0];
  const tip = Sim._stingTip(r);
  r.sting = { state: 'active', timer: 0.1, x: tip.x, y: tip.y };
  s.players[0].x = tip.x;
  s.players[0].y = tip.y;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[0].deathKind, 'stung');
});

test('tail-strike does NOT kill outside stingReach', () => {
  const s = stateWithOneRay();
  const r = s.stingrays[0];
  const tip = Sim._stingTip(r);
  r.sting = { state: 'active', timer: 0.1, x: tip.x, y: tip.y };
  // Well outside: player body radius + sting reach + generous margin
  s.players[0].x = tip.x + CFG.stingray.stingReach + CFG.player.rx + 40;
  s.players[0].y = tip.y;
  s.players[0].vy = 0;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.players[0].alive, true);
});

test('ray body is safe to touch while sting is idle or winding up', () => {
  for (const stingState of ['idle', 'windup']) {
    const s = stateWithOneRay({
      sting: { state: stingState, timer: 1, x: 0, y: 0 }
    });
    const r = s.stingrays[0];
    s.players[0].x = r.x;   // right on the body
    s.players[0].y = r.y;
    s.players[0].vy = 0;
    Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
    assert.equal(s.players[0].alive, true, `player on body during ${stingState} should survive`);
  }
});

test('sharks-only mode never spawns stingrays or anchors', () => {
  const s = Sim.createState({
    seed: 1,
    mode: 'party',
    hazards: 'sharks-only',
    // pack of bots so someone survives long enough to test the ray/anchor windows
    players: Array.from({ length: 6 }, (_, i) => ({ id: i, name: 'B' + i, isBot: true }))
  });
  let peakRays = 0, peakAnchors = 0;
  for (let i = 0; i < 4500; i++) {
    Sim.step(s, {}, 1 / 60);
    peakRays = Math.max(peakRays, s.stingrays.length);
    peakAnchors = Math.max(peakAnchors, s.anchors.length);
    if (s.status === 'over') break;
  }
  assert.equal(peakRays, 0, 'no rays should ever spawn in sharks-only mode');
  assert.equal(peakAnchors, 0, 'no anchors should ever spawn in sharks-only mode');
  assert.ok(s.sharks.length > 0 || s.status === 'over', 'sharks should still spawn');
});

test('bots treat an active tail-strike as a threat', () => {
  const s = Sim.createState({
    seed: 1,
    mode: 'party',
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
  // active ray just ahead of the bot, tip at same y as bot -> bot should steer AWAY
  const r = {
    id: 1, x: bot.x + 120, y: 620, baseY: 620, swimT: 0,
    waveAmp: 0, waveFreq: 0, wavePhase: 0, vx: 0, scale: 1.3,
    sting: { state: 'active', timer: 0.1, x: bot.x + 120, y: bot.y }
  };
  const tip = Sim._stingTip(r);
  r.sting.x = tip.x; r.sting.y = tip.y;
  // put the bot right at the tip's Y so any direction change counts as dodging
  bot.y = tip.y;
  s.stingrays = [r];
  const intent = Sim._botIntent(s, bot);
  assert.ok(intent.up !== intent.down, `bot should pick a direction, got up=${intent.up} down=${intent.down}`);
});
