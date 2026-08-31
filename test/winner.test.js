// Winner resolution rules:
//   - Party (>1 players): last swimmer alive wins immediately.
//   - Party, all dead: longest-survivor (largest deathT) wins.
//   - Solo (1 player): winner is that player, resolved when they die.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sim } from '../src/sim.js';

function newState(mode, playerCount) {
  const players = [];
  for (let i = 0; i < playerCount; i++) players.push({ id: i, name: 'P' + i, isBot: false });
  return Sim.createState({ seed: 1, mode, players });
}

test('party: last swimmer alive wins immediately', () => {
  const s = newState('party', 3);
  s.t = 5;
  Sim._kill(s, s.players[0], 'eaten', 0, 0);
  Sim._resolveWinner(s);
  assert.equal(s.status, 'playing', 'still 2 alive - not over yet');
  Sim._kill(s, s.players[1], 'laser', 0, 0);
  Sim._resolveWinner(s);
  assert.equal(s.status, 'over');
  assert.equal(s.winnerId, s.players[2].id, 'last swimmer wins');
});

test('party: all dead - longest survivor wins on deathT tiebreak', () => {
  const s = newState('party', 3);
  s.t = 3;
  Sim._kill(s, s.players[0], 'eaten', 0, 0);   // deathT = 3
  s.t = 5;
  Sim._kill(s, s.players[1], 'laser', 0, 0);   // deathT = 5
  s.t = 4;
  Sim._kill(s, s.players[2], 'eaten', 0, 0);   // deathT = 4
  Sim._resolveWinner(s);
  assert.equal(s.status, 'over');
  assert.equal(s.winnerId, s.players[1].id, 'largest deathT (5) wins');
});

test('solo: winner is the sole player when they die', () => {
  const s = newState('solo', 1);
  s.t = 7.5;
  Sim._kill(s, s.players[0], 'eaten', 0, 0);
  Sim._resolveWinner(s);
  assert.equal(s.status, 'over');
  assert.equal(s.winnerId, s.players[0].id);
});
