// Determinism is the load-bearing invariant for the eventual multiplayer server:
// same seed + same input stream MUST produce the same state on any JS engine.
// If this test ever fails, someone introduced non-determinism (Math.random,
// Date.now, iteration over an unordered Map, etc.) and the server/client will
// desync.
//
// Two guards:
//  1. self-consistency: two runs with the same config produce equal state.
//  2. golden state: current sim matches the state captured from the pre-refactor
//     code (see scripts/capture-golden.cjs history), catching accidental
//     gameplay drift introduced by the module extraction.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Sim } from '../src/sim.js';

const HERE = dirname(fileURLToPath(import.meta.url));

const CONFIG = {
  seed: 12345,
  mode: 'party',
  players: [
    { id: 0, name: 'Ada', isBot: false },
    { id: 1, name: 'Ben', isBot: true },
    { id: 2, name: 'Cai', isBot: true },
    { id: 3, name: 'Dot', isBot: true }
  ]
};
const DT = 1 / 60;
const MAX_TICKS = 1800;

function runSim(config) {
  const state = Sim.createState(config);
  for (let i = 0; i < MAX_TICKS; i++) {
    const humanUp = ((i / 30) | 0) % 2 === 0 ? 1 : 0;
    const humanDown = 1 - humanUp;
    Sim.step(state, { 0: { up: humanUp, down: humanDown } }, DT);
    if (state.status === 'over') break;
  }
  return state;
}

// Strip the rng closure and round numbers so JSON serialisation is stable.
function scrub(v) {
  if (typeof v === 'function') return undefined;
  if (Array.isArray(v)) return v.map(scrub);
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      // rng is a closure (unserialisable); diff is a resolved snapshot of the
      // difficulty preset (a copy of CFG) and would bloat the fixture and
      // couple it to unrelated CFG tuning changes - exclude both from the
      // comparison.
      if (k === 'rng' || k === 'diff') continue;
      const sv = scrub(val);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }
  if (typeof v !== 'number') return v;
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;   // normalise signed zero so JSON round-trips cleanly
}

test('sim is self-consistent: same seed + same inputs produce equal state', () => {
  const a = scrub(runSim(CONFIG));
  const b = scrub(runSim(CONFIG));
  assert.deepEqual(a, b);
});

test('sim matches golden state captured from pre-refactor code', () => {
  const golden = JSON.parse(readFileSync(join(HERE, 'fixtures/golden-state.json'), 'utf8'));
  const now = scrub(runSim(CONFIG));
  assert.deepEqual(now, golden);
});
