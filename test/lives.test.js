// Lives system: solo mode gives the player 3 lives; each death spends one
// and grants brief invulnerability so the same hazard doesn't insta-kill on
// respawn. Party mode is unchanged (one life - the picker rules need it).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CFG, Sim } from '../src/sim.js';

test('config.lives applies to every player (solo and party); default is 1', () => {
  const defSolo = Sim.createState({ seed: 1, mode: 'solo', players: [{ name: 'A' }] });
  const defParty = Sim.createState({ seed: 1, mode: 'party', players: [{ name: 'A' }, { name: 'B', isBot: true }] });
  assert.equal(defSolo.players[0].lives, 1);
  for (const p of defParty.players) assert.equal(p.lives, 1);

  const bigSolo = Sim.createState({ seed: 1, mode: 'solo', lives: 3, players: [{ name: 'A' }] });
  const bigParty = Sim.createState({ seed: 1, mode: 'party', lives: 5, players: [{ name: 'A' }, { name: 'B', isBot: true }] });
  assert.equal(bigSolo.players[0].lives, 3);
  for (const p of bigParty.players) assert.equal(p.lives, 5);
  assert.equal(bigSolo.initialLives, 3);
  assert.equal(bigParty.initialLives, 5);
});

test('losing a life with extras keeps the player alive and grants invuln', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', lives: 3, players: [{ name: 'A' }] });
  const p = s.players[0];
  Sim._kill(s, p, 'eaten', p.x, p.y);
  assert.equal(p.alive, true, 'still alive with lives remaining');
  assert.equal(p.lives, 2);
  assert.ok(p.invuln > 0, 'invuln armed after the hit');
});

test('further hits during invuln are absorbed (no life loss)', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', lives: 3, players: [{ name: 'A' }] });
  const p = s.players[0];
  Sim._kill(s, p, 'eaten', p.x, p.y);
  const livesAfterFirst = p.lives;
  Sim._kill(s, p, 'laser', p.x, p.y);   // absorbed
  Sim._kill(s, p, 'stung', p.x, p.y);   // absorbed
  assert.equal(p.lives, livesAfterFirst, 'invuln absorbs subsequent hits');
  assert.equal(p.alive, true);
});

test('the final life ends the game in solo mode', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', lives: 3, players: [{ name: 'A' }] });
  const p = s.players[0];
  for (let i = 0; i < s.initialLives; i++) {
    p.invuln = 0;
    Sim._kill(s, p, 'eaten', p.x, p.y);
  }
  Sim._resolveWinner(s);
  assert.equal(p.alive, false, 'dead after the last life is spent');
  assert.equal(p.lives, 0);
  assert.equal(s.status, 'over');
});

test('invuln ticks down each step and expires', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', lives: 3, players: [{ name: 'A' }] });
  const p = s.players[0];
  s.spawnTimer = 1e6;
  Sim._kill(s, p, 'eaten', p.x, p.y);
  const start = p.invuln;
  Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.ok(p.invuln < start, 'invuln timer should have ticked down');
  for (let i = 0; i < 200; i++) Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(p.invuln, 0, 'invuln should have fully expired');
});

test('a lost life drops a coffin at the player position and it stays there', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', lives: 2, players: [{ name: 'A' }] });
  const p = s.players[0];
  const py = p.y;
  Sim._kill(s, p, 'eaten', 0, 0);
  assert.equal(s.coffins.length, 1, 'coffin dropped when a life is lost');
  const cf = s.coffins[0];
  assert.equal(cf.x, p.x);
  assert.equal(cf.y, py);
  const startX = cf.x, startY = cf.y;
  // Tick some frames - coffin should NOT move (it stays at the death spot).
  for (let i = 0; i < 30; i++) Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.coffins[0].x, startX, 'coffin should not drift');
  assert.equal(s.coffins[0].y, startY, 'coffin should not sink');
});

test('coffin culled once its lifetime expires', () => {
  const s = Sim.createState({ seed: 1, mode: 'solo', lives: 2, players: [{ name: 'A' }] });
  const p = s.players[0];
  Sim._kill(s, p, 'eaten', 0, 0);
  assert.equal(s.coffins.length, 1);
  // Fast-forward past the coffin's lifetime.
  for (let i = 0; i < 60 * 5; i++) Sim.step(s, { 0: { up: 0, down: 0 } }, 1 / 60);
  assert.equal(s.coffins.length, 0, 'coffin should be culled after lifetime');
});
