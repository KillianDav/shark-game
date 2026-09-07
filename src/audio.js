// standup-shark ambient audio.
//
// Synthesised entirely with the Web Audio API - no asset files, no CORS, no
// codecs. The goal is a QUIET, VARIED, slightly OTHERWORLDLY deep-sea
// ambience, not just a bedroom hush. Layers:
//
//   1. Brown-noise "hush" through a lowpass whose frequency drifts via a
//      slow LFO (200 Hz ± 100 Hz over ~24 s). Gives a swirling, watery
//      character rather than a flat noise bed.
//   2. Two sub-bass sine drones at 55.0 Hz and 55.7 Hz. The tiny detuning
//      makes them beat every ~1.4 s - a natural throb that never quite
//      repeats.
//   3. A wandering mid drone (~180 Hz) whose pitch drifts ± 40 Hz over
//      ~30 s via a second LFO. Ran through a narrow bandpass so it
//      sounds like a resonant pipe under the ocean.
//   4. Rare deep sonar "pings": a short sine burst at a random low pitch,
//      volume swelling then decaying over 3-5 s. Fires roughly every
//      18-45 s. The variety keeps the ambience feeling alive.
//   5. Even rarer "shimmer" - bandpassed white-noise sweep, once every
//      45-90 s. Adds an alien, faintly musical quality.
//
// Everything is quiet by design (master gain 0.55, individual layers even
// lower). Deferred to the first user gesture; mute persists in localStorage.

const MUTE_KEY = "sharkGameMuted";

export function makeAudio() {
  let ctx = null;
  let masterGain = null;
  let started = false;
  let muted = false;
  let pingTimer = null;
  let shimmerTimer = null;
  try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch { /* private mode - ignore */ }

  function _init() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ctx = new Ctor();
    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : 0.55;   // overall level - deliberately subtle
    masterGain.connect(ctx.destination);

    _makeHushLayer();
    _makeSubBassLayer();
    _makeMidDroneLayer();
    _schedulePings();
    _scheduleShimmer();
    return true;
  }

  // ---- Layer 1: hush ----
  function _makeHushLayer() {
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 4, sr);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;

    const lowPass = ctx.createBiquadFilter();
    lowPass.type = "lowpass";
    lowPass.frequency.value = 200;
    lowPass.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.value = 0.14;

    noise.connect(lowPass).connect(g).connect(masterGain);

    // Slow LFO drifts the cutoff up and down: 200 ± 100 Hz over ~24 s.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 1 / 24;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 100;
    lfo.connect(lfoAmt).connect(lowPass.frequency);
    lfo.start();
    noise.start();
  }

  // ---- Layer 2: two slightly-detuned sub-bass sines ----
  function _makeSubBassLayer() {
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(masterGain);
    for (const freq of [55.0, 55.7]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(g);
      osc.start();
    }
    // Very slow gain wobble on top of the beat effect.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 1 / 17;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.02;
    lfo.connect(lfoAmt).connect(g.gain);
    lfo.start();
  }

  // ---- Layer 3: wandering mid drone ----
  function _makeMidDroneLayer() {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 180;

    const bandPass = ctx.createBiquadFilter();
    bandPass.type = "bandpass";
    bandPass.frequency.value = 180;
    bandPass.Q.value = 6;

    const g = ctx.createGain();
    g.gain.value = 0.028;

    osc.connect(bandPass).connect(g).connect(masterGain);
    osc.start();

    // LFO on the oscillator pitch: ±40 Hz over ~30 s.
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 1 / 30;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 40;
    lfo.connect(lfoAmt).connect(osc.frequency);
    lfo.start();

    // Also drift the bandpass along with it, staying centred on the tone.
    const lfo2 = ctx.createOscillator();
    lfo2.type = "sine";
    lfo2.frequency.value = 1 / 30;
    const lfo2Amt = ctx.createGain();
    lfo2Amt.gain.value = 40;
    lfo2.connect(lfo2Amt).connect(bandPass.frequency);
    lfo2.start();
  }

  // ---- Layer 4: rare deep sonar-ish pings ----
  function _schedulePings() {
    const fire = () => {
      _ping();
      const nextMs = 18000 + Math.random() * 27000;   // 18-45 s
      pingTimer = setTimeout(fire, nextMs);
    };
    pingTimer = setTimeout(fire, 8000 + Math.random() * 8000);   // first ping 8-16 s in
  }
  function _ping() {
    if (!ctx || muted) return;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    // Random low-mid pitch, chosen from a set of "musical" ratios for a
    // faintly harmonic feel - avoids the "sci-fi random bleep" trap.
    const roots = [110, 138.6, 164.8, 220];   // A2, C#3, E3, A3
    osc.frequency.value = roots[(Math.random() * roots.length) | 0];

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 4;

    const g = ctx.createGain();
    const now = ctx.currentTime;
    const attack = 1.2, sustain = 2.0, release = 1.6;
    const peak = 0.06;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + attack);
    g.gain.setValueAtTime(peak, now + attack + sustain);
    g.gain.linearRampToValueAtTime(0, now + attack + sustain + release);

    osc.connect(filter).connect(g).connect(masterGain);
    osc.start(now);
    osc.stop(now + attack + sustain + release + 0.1);
  }

  // ---- Layer 5: even rarer shimmer sweeps ----
  function _scheduleShimmer() {
    const fire = () => {
      _shimmer();
      const nextMs = 45000 + Math.random() * 45000;   // 45-90 s
      shimmerTimer = setTimeout(fire, nextMs);
    };
    shimmerTimer = setTimeout(fire, 25000 + Math.random() * 15000);
  }
  function _shimmer() {
    if (!ctx || muted) return;
    const sr = ctx.sampleRate;
    const buf = ctx.createBuffer(1, sr * 3, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.35;
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 18;

    const g = ctx.createGain();
    const now = ctx.currentTime;
    const dur = 2.4;
    const peak = 0.055;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + dur * 0.35);
    g.gain.linearRampToValueAtTime(0, now + dur);

    // Sweep bandpass frequency from low to high (or high to low) for the
    // "swirling shimmer" character.
    const goUp = Math.random() > 0.5;
    const startHz = goUp ? 400 : 2400;
    const endHz   = goUp ? 2400 : 400;
    bp.frequency.setValueAtTime(startHz, now);
    bp.frequency.exponentialRampToValueAtTime(endHz, now + dur);

    src.connect(bp).connect(g).connect(masterGain);
    src.start(now);
    src.stop(now + dur + 0.1);
  }

  return {
    start() {
      if (started) return;
      if (!_init()) return;
      started = true;
      if (ctx.state === "suspended") ctx.resume().catch(() => { /* ignore */ });
    },
    // Tear the whole audio graph down. The next start() rebuilds from
    // scratch (so mid-round pings / shimmer state don't leak across
    // rounds). Called by main.js when a round ends.
    stop() {
      if (!started) return;
      if (pingTimer)    { clearTimeout(pingTimer);    pingTimer = null; }
      if (shimmerTimer) { clearTimeout(shimmerTimer); shimmerTimer = null; }
      if (ctx) {
        try { ctx.close(); } catch { /* already closed */ }
      }
      ctx = null; masterGain = null; started = false;
    },
    isStarted() { return started; },
    isMuted()   { return muted; },
    setMuted(next) {
      muted = !!next;
      try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
      if (masterGain) masterGain.gain.value = muted ? 0 : 0.55;
    },
    toggleMute() { this.setMuted(!muted); return muted; }
  };
}
