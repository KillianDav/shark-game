// standup-shark LocalTransport: runs the Sim in-tab. Same interface as a future
// WebSocketTransport - start/sendInput/tick/snapshot/isOver.
import { Sim } from './sim.js';

export function LocalTransport() {
  let state = null;
  const pendingInputs = {};   // playerId -> intent
  return {
    start(config) { state = Sim.createState(config); },
    sendInput(playerId, intent) { pendingInputs[playerId] = intent; },
    // Advance the local simulation one fixed tick using buffered inputs.
    tick(dt) { if (state) Sim.step(state, pendingInputs, dt); },
    snapshot() { return state; },
    isOver() { return !!state && state.status === "over"; }
  };
}
