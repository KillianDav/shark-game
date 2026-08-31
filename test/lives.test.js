// Lives system: solo mode gives the player 3 lives; each death spends one
// and grants brief invulnerability so the same hazard doesn't insta-kill on
// respawn. Party mode is unchanged (one life - the picker rules need it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

test('solo starts with 3 lives; party starts with 1', () => {
  const solo = Sim.createState({ seed: 1, mode: 'solo', players: [{ name: 'A' }] });
  const party = Sim.createState({ seed: 1, mode: 'party', players: [{ name: 'A' }, { name: 'B', isBot: true }] });
  assert.equal(solo.players[0].lives, CFG.player.livesSolo);
  for (const p of party.players) assert.equal(p.lives, CFG.player.livesParty);
});

test('losing a life in solo keeps the player alive and grants invuln', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', players: [{ name: 'A' }] });
  const p = s.players[0];
  Sim._kill(s, p, 'eaten', p.x, p.y);
  assert.equal(p.alive, true, 'still alive with lives remaining');
  assert.equal(p.lives, CFG.player.livesSolo - 1);
  assert.ok(p.invuln > 0, 'invuln armed after the hit');
});

test('further hits during invuln are absorbed (no life loss)', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', players: [{ name: 'A' }] });
  const p = s.players[0];
  Sim._kill(s, p, 'eaten', p.x, p.y);   // lives 3 -> 2, invuln armed
  const livesAfterFirst = p.lives;
  Sim._kill(s, p, 'laser', p.x, p.y);   // absorbed
  Sim._kill(s, p, 'stung', p.x, p.y);   // absorbed
  assert.equal(p.lives, livesAfterFirst, 'invuln absorbs subsequent hits');
  assert.equal(p.alive, true);
});

test('the final life ends the game in solo mode', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', players: [{ name: 'A' }] });
  const p = s.players[0];
  // Bypass invuln between manual kills so each one lands.
  for (let i = 0; i < CFG.player.livesSolo; i++) {
    p.invuln = 0;
    Sim._kill(s, p, 'eaten', p.x, p.y);
  }
  Sim._resolveWinner(s);
  assert.equal(p.alive, false, 'dead after the last life is spent');
  assert.equal(p.lives, 0);
  assert.equal(s.status, 'over');
});

test('invuln ticks down each step and expires', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', players: [{ name: 'A' }] });
  const p = s.players[0];
  s.spawnTimer = 1e6;
  Sim._kill(s, p, 'eaten', p.x, p.y);
  const start = p.invuln;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.ok(p.invuln < start, 'invuln timer should have ticked down');
  // Fast-forward past the invuln window.
  for (let i = 0; i < 200; i++) Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(p.invuln, 0, 'invuln should have fully expired');
});
