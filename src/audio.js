// standup-shark ambient audio.
//
// Synthesises an underwater ambience with the Web Audio API - no asset files,
// no CORS, no codecs. Two layers:
//   1. Brown noise (integrated white noise, low-frequency-emphasised) run
//      through a low-pass filter around 400 Hz - muffled, water-like hush.
//   2. A very low sine drone (~55 Hz) for the sub-bass "deep water" feel.
//
// Browsers block AudioContext creation until a user gesture, so we defer
// setup to the first Audio.start() call (which main.js triggers when the
// player clicks Start or Create/Join Room). Mute state is remembered in
// localStorage under `sharkGameMuted`.

const MUTE_KEY = "sharkGameMuted";

export function makeAudio() {
  let ctx = null;
  let masterGain = null;
  let started = false;
  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* private mode - ignore */ }

  function _init() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 1;
    masterGain.connect(ctx.destination);

    // ---- Brown noise loop ----
    // Generate a 4-second buffer of brown noise and loop it. Integrated
    // white noise = brown (each sample nudged slightly from the last).
    const sampleRate = ctx.sampleRate;
    const bufSize = sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufSize, sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;   // amplify (brown noise is quiet after the integration)
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const lowPass = ctx.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 400;   // "muffled through water"
    lowPass.Q.value = 0.5;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.28;

    noise.connect(lowPass).connect(noiseGain).connect(masterGain);
    noise.start();

    // ---- Sub-bass drone ----
    const drone = ctx.createOscillator();
    drone.type = "sine";
    drone.frequency.value = 55;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.045;
    drone.connect(droneGain).connect(masterGain);
    drone.start();

    // ---- Slow LFO on the drone gain for a slight breathing effect ----
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;   // ~12 s period
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.015;
    lfo.connect(lfoAmt).connect(droneGain.gain);
    lfo.start();

    return true;
  }

  return {
    // Call from a user-gesture handler (button click, etc.) to unlock audio.
    start() {
      if (started) return;
      if (!_init()) return;
      started = true;
      // Some browsers still start the context suspended even after gesture.
      if (ctx.state === "suspended") ctx.resume().catch(() => { /* ignore */ });
    },
    isStarted() { return started; },
    isMuted()   { return muted; },
    setMuted(next) {
      muted = !!next;
      try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
      if (masterGain) masterGain.gain.value = muted ? 0 : 1;
    },
    toggleMute() { this.setMuted(!muted); return muted; }
  };
}
