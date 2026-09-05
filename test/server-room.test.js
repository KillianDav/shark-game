// Room lifecycle tests. No real websocket - a mock ws captures every payload
// so we can assert what would have been broadcast without spinning up a
// server. Sim.step is the real thing; we drive ticks manually.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../server/room.js';
import { CFG } from '../src/sim.js';

function mockWs() {
  return {
    readyState: 1,
    sent: [],
    send(payload) { this.sent.push(JSON.parse(payload)); },
    // Convenience: latest message of a given type.
    lastOf(type) { for (let i = this.sent.length - 1; i >= 0; i--) if (this.sent[i].type === type) return this.sent[i]; return null; }
  };
}

test('first player becomes host; lobby broadcast reaches every socket', () => {
  const room = new Room('WAVE', () => {});
  const a = mockWs(), b = mockWs();
  const pa = room.addPlayer(a, 'Ada');
  const pb = room.addPlayer(b, 'Ben');
  assert.equal(room.hostId, pa.id, 'first player is host');
  assert.notEqual(pa.id, pb.id, 'ids are distinct');
  // Both sockets received the last lobby broadcast with two players.
  const la = a.lastOf('lobby');
  const lb = b.lastOf('lobby');
  assert.equal(la.players.length, 2);
  assert.equal(lb.players.length, 2);
  assert.equal(la.code, 'WAVE');
  assert.equal(la.hostId, pa.id);
  // Each socket also receives a 'you' with its own id.
  assert.equal(a.lastOf('you').id, pa.id);
  assert.equal(b.lastOf('you').id, pb.id);
});

test('host leaving promotes the next player; last player closes the room', () => {
  let emptiedCode = null;
  const room = new Room('SEAB', (code) => { emptiedCode = code; });
  const a = mockWs(), b = mockWs();
  const pa = room.addPlayer(a, 'Ada');
  const pb = room.addPlayer(b, 'Ben');
  room.removePlayerByWs(a);
  assert.equal(room.hostId, pb.id, 'remaining player is promoted to host');
  room.removePlayerByWs(b);
  assert.equal(emptiedCode, 'SEAB', 'onEmpty called when last player leaves');
});

test('addPlayer refuses new joiners once round has started', () => {
  const room = new Room('KELP', () => {});
  const host = mockWs();
  const hp = room.addPlayer(host, 'Ada');
  room.start({}, host);
  const late = mockWs();
  const added = room.addPlayer(late, 'Late');
  assert.equal(added, null, 'addPlayer returns null when not in lobby');
  assert.equal(late.lastOf('error').msg, 'round already started');
  room._shutdown();   // clean up interval so the test doesn't leak
});

test('start rejects a non-host requester', () => {
  const room = new Room('CORL', () => {});
  const host = mockWs(), other = mockWs();
  const hp = room.addPlayer(host, 'Ada');
  const op = room.addPlayer(other, 'Ben');
  room.start({}, other);       // non-host tries to start
  assert.equal(room.status, 'lobby', 'stays in lobby');
  assert.equal(room.state, null);
  room._shutdown();
});

test('start seeds a Sim, tick advances it, over fires when the sim resolves', () => {
  const room = new Room('REEF', () => {});
  const host = mockWs();
  const hp = room.addPlayer(host, 'Ada');
  // Solo-ish round: just the host, lives=1 so the game ends quickly when
  // hazards catch up.
  room.start({ mode: 'party', hazards: 'sharks-only', lives: 1 }, host);
  assert.equal(room.status, 'playing');
  assert.ok(room.state, 'Sim state created');
  assert.equal(room.state.mode, 'party');
  // Manually pump ticks until the sim ends (interval was created by start()
  // but we can call _tick(dt) directly for deterministic timing).
  clearInterval(room.tickInterval); room.tickInterval = null;
  const dt = CFG.fixedDt;
  let guard = 0;
  while (room.status === 'playing' && guard < 60 * 90) {
    room._tick(dt);
    guard++;
  }
  assert.equal(room.status, 'over', 'round ended');
  assert.ok(host.lastOf('over'), 'over broadcast sent');
  assert.ok(host.lastOf('state'), 'at least one state snapshot broadcast');
  room._shutdown();
});

test('applyInput buffers the latest intent per player', () => {
  const room = new Room('FISH', () => {});
  const a = mockWs();
  const pa = room.addPlayer(a, 'Ada');
  room.applyInput(a, { up: true, down: false });
  const player = room.players.find((p) => p.id === pa.id);
  assert.deepEqual(player.intent, { up: true, down: false });
  // Overwrites, not accumulates.
  room.applyInput(a, { up: false, down: true });
  assert.deepEqual(player.intent, { up: false, down: true });
});

test('snapshot broadcast happens every 3rd tick', () => {
  const room = new Room('TIDE', () => {});
  const host = mockWs();
  const hp = room.addPlayer(host, 'Ada');
  room.start({ mode: 'party', hazards: 'sharks-only', lives: 5 }, host);
  clearInterval(room.tickInterval); room.tickInterval = null;
  const before = host.sent.filter((m) => m.type === 'state').length;
  const dt = CFG.fixedDt;
  for (let i = 0; i < 12; i++) room._tick(dt);
  const after = host.sent.filter((m) => m.type === 'state').length;
  const delivered = after - before;
  // 12 ticks / broadcast every 3rd = exactly 4 snapshots.
  assert.equal(delivered, 4, `expected 4 state broadcasts, got ${delivered}`);
  room._shutdown();
});
