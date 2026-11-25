// Alarm sound engine (Web Audio). Built-in sounds are synthesized once into
// AudioBuffers, so no audio files are needed; uploaded files are decoded the same way.
import { getSound } from "./store.js";

export const BUILTIN_SOUNDS = [
  { id: "dhol", name: "Dhol beat 🥁", group: "Energetic" },
  { id: "workout", name: "Workout beat 💥", group: "Energetic" },
  { id: "whistle", name: "Coach whistle 📣", group: "Energetic" },
  { id: "levelup", name: "Level up 🎮", group: "Energetic" },
  { id: "airhorn", name: "Air horn 📯", group: "Energetic" },
  { id: "siren", name: "Siren 🚨", group: "Energetic" },
  { id: "buzzer", name: "Loud buzzer (heavy sleepers)", group: "Energetic" },
  { id: "classic", name: "Classic beeps", group: "Classic" },
  { id: "digital", name: "Digital watch", group: "Classic" },
  { id: "phone", name: "Old telephone ☎️", group: "Classic" },
  { id: "fanfare", name: "Morning fanfare 🎺", group: "Classic" },
  { id: "marimba", name: "Marimba rise 🎵", group: "Gentle start" },
  { id: "chimes", name: "Chimes 🔔", group: "Gentle start" },
  { id: "birds", name: "Morning birds 🐦", group: "Gentle start" },
];
export const DEFAULT_SOUND = "dhol";

let ctx = null;
const bufferCache = new Map();

export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: "playback" });
  }
  return ctx;
}

export function audioRunning() {
  return !!ctx && ctx.state === "running";
}

/** Must be called from a tap/click at least once so later sounds can play by themselves. */
export async function unlockAudio() {
  try {
    // iOS 17+: play even when the ring/silent switch is on silent.
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch { /* not supported */ }
  const c = audioCtx();
  if (c.state !== "running") {
    try { await c.resume(); } catch { /* ignore */ }
  }
  try {
    const b = c.createBuffer(1, 1, 22050);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch { /* ignore */ }
  return c.state === "running";
}

// ---------- synthesis ----------

const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

function env(g, t, dur, peak, attack = 0.005, release = 0.03) {
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, Math.max(t + attack, t + dur - release));
  g.gain.linearRampToValueAtTime(0, t + dur);
}

function osc(oc, dest, { type = "sine", freq, start, dur, gain = 0.5, attack, release, freqEnd, glide = "exp" }) {
  const o = oc.createOscillator();
  const g = oc.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (freqEnd) {
    if (glide === "exp") o.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    else o.frequency.linearRampToValueAtTime(freqEnd, start + dur);
  }
  env(g, start, dur, gain, attack, release);
  o.connect(g).connect(dest);
  o.start(start);
  o.stop(start + dur + 0.02);
}

function bell(oc, dest, freq, start, dur = 1.6, gain = 0.5) {
  // Inharmonic partials with exponential decay: a simple bell.
  for (const [ratio, amp] of [[1, 1], [2.76, 0.45], [5.4, 0.25], [8.93, 0.12]]) {
    const o = oc.createOscillator();
    const g = oc.createGain();
    o.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain * amp, start + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur / ratio ** 0.4);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur);
  }
}

// ---- percussion & instruments for the beat-based sounds ----

function noiseBuffer(oc, dur = 1) {
  const b = oc.createBuffer(1, Math.ceil(dur * oc.sampleRate), oc.sampleRate);
  const d = b.getChannelData(0);
  let seed = 12345; // deterministic noise so every render sounds the same
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return b;
}

function noiseHit(oc, dest, noise, t, { dur = 0.1, gain = 0.5, type = "bandpass", freq = 2000, q = 1 }) {
  const src = oc.createBufferSource();
  src.buffer = noise;
  const f = oc.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = oc.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, (t * 0.37) % 0.5);
  src.stop(t + dur + 0.02);
}

function drum(oc, dest, t, { f0 = 150, f1 = 50, dur = 0.4, gain = 1 }) {
  const o = oc.createOscillator();
  const g = oc.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.6);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const kick = (oc, dest, t, gain = 1) => drum(oc, dest, t, { f0: 160, f1: 45, dur: 0.35, gain });
const clap = (oc, dest, noise, t, gain = 0.6) => {
  for (const d of [0, 0.012, 0.024]) noiseHit(oc, dest, noise, t + d, { dur: d === 0.024 ? 0.18 : 0.03, gain, freq: 1400, q: 0.8 });
};
const hat = (oc, dest, noise, t, gain = 0.18, open = false) =>
  noiseHit(oc, dest, noise, t, { dur: open ? 0.22 : 0.045, gain, type: "highpass", freq: 7500, q: 0.5 });

function marimba(oc, dest, freq, t, gain = 0.5) {
  for (const [ratio, amp, decay] of [[1, 1, 0.9], [3.93, 0.25, 0.12], [9.2, 0.06, 0.04]]) {
    const o = oc.createOscillator();
    const g = oc.createGain();
    o.frequency.value = freq * ratio;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain * amp, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.02);
  }
}

/** Plucked string (Karplus-Strong), e.g. a tumbi-like twang. */
function pluck(oc, dest, freq, t, { dur = 0.5, gain = 0.5, bright = 0.5 } = {}) {
  const sr = oc.sampleRate;
  const n = Math.round(sr / freq);
  const len = Math.ceil(dur * sr);
  const buf = oc.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(n);
  let seed = Math.round(freq * 1000);
  for (let i = 0; i < n; i++) { seed = (seed * 16807) % 2147483647; ring[i] = (seed / 2147483647) * 2 - 1; }
  let idx = 0;
  const damp = 0.996;
  for (let i = 0; i < len; i++) {
    const next = (idx + 1) % n;
    const v = ring[idx];
    ring[idx] = damp * (bright * v + (1 - bright) * 0.5 * (v + ring[next]));
    out[i] = v;
    idx = next;
  }
  const src = oc.createBufferSource();
  src.buffer = buf;
  const g = oc.createGain();
  g.gain.value = gain;
  src.connect(g).connect(dest);
  src.start(t);
}

function tone(oc, dest, { type = "sine", freq, t, dur, gain = 0.4, attack = 0.005, release = 0.02, filter = null }) {
  const o = oc.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  const g = oc.createGain();
  env(g, t, dur, gain, attack, release);
  let node = o;
  if (filter) { const f = oc.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; o.connect(f); node = f; }
  node.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}

const RECIPES = {
  classic: { len: 1.4, build(oc, out) {
    const lp = oc.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5000; lp.connect(out);
    for (let i = 0; i < 4; i++) osc(oc, lp, { type: "square", freq: 1046, start: i * 0.2, dur: 0.12, gain: 0.35 });
  } },
  fanfare: { len: 2.8, build(oc, out) {
    const seq = [[67, 0, 0.16], [72, 0.17, 0.16], [76, 0.34, 0.16], [79, 0.51, 0.3], [76, 0.84, 0.14], [79, 1.0, 0.6]];
    for (const [n, t, d] of seq) {
      osc(oc, out, { type: "triangle", freq: NOTE(n), start: t, dur: d, gain: 0.55, release: 0.05 });
      osc(oc, out, { type: "square", freq: NOTE(n - 12), start: t, dur: d, gain: 0.08, release: 0.05 });
    }
  } },
  chimes: { len: 3.4, build(oc, out) {
    [88, 84, 86, 79].forEach((n, i) => bell(oc, out, NOTE(n), i * 0.45, 1.8, 0.42));
  } },
  digital: { len: 1.0, build(oc, out) {
    for (const t of [0, 0.12, 0.24, 0.36]) osc(oc, out, { type: "square", freq: 3900, start: t, dur: 0.06, gain: 0.22, attack: 0.002, release: 0.005 });
  } },
  siren: { len: 1.6, build(oc, out) {
    osc(oc, out, { type: "sawtooth", freq: 620, freqEnd: 1450, start: 0, dur: 0.8, gain: 0.28, attack: 0.02, release: 0.001 });
    osc(oc, out, { type: "sawtooth", freq: 1450, freqEnd: 620, start: 0.8, dur: 0.8, gain: 0.28, attack: 0.001, release: 0.02 });
  } },
  buzzer: { len: 0.75, build(oc, out) {
    osc(oc, out, { type: "sawtooth", freq: 147, start: 0, dur: 0.48, gain: 0.5, attack: 0.004, release: 0.01 });
    osc(oc, out, { type: "square", freq: 294, start: 0, dur: 0.48, gain: 0.25, attack: 0.004, release: 0.01 });
  } },

  // Bhangra-style dhol groove (bass "dagga" + sharp "tilli") with a tumbi-like riff.
  dhol: { len: 4.0, drive: 3.2, build(oc, out) {
    const noise = noiseBuffer(oc, 1);
    const beat = 0.5; // 120 BPM
    for (let bar = 0; bar < 2; bar++) {
      const b0 = bar * 4 * beat;
      for (const x of [0, 1.5, 2, 3]) drum(oc, out, b0 + x * beat, { f0: 110, f1: 55, dur: 0.45, gain: 1 });
      for (const x of [0.5, 1, 2.5, 3.5, 3.75]) {
        drum(oc, out, b0 + x * beat, { f0: 520, f1: 330, dur: 0.12, gain: 0.45 });
        noiseHit(oc, out, noise, b0 + x * beat, { dur: 0.05, gain: 0.35, freq: 3500, q: 1.2 });
      }
      for (let k = 0; k < 16; k++) hat(oc, out, noise, b0 + k * beat / 4, k % 2 ? 0.07 : 0.11);
    }
    const riff = [76, 76, 79, 81, 79, 76, 74, 76, 79, 79, 81, 83, 81, 79, 76, 79];
    riff.forEach((n, i) => pluck(oc, out, NOTE(n), i * 0.25, { dur: 0.4, gain: 0.35, bright: 0.7 }));
  } },

  // Gym-style 128 BPM beat: kick, claps, hats and a driving bassline.
  workout: { len: 3.75, drive: 2.6, build(oc, out) {
    const noise = noiseBuffer(oc, 1);
    const beat = 60 / 128;
    for (let i = 0; i < 8; i++) {
      kick(oc, out, i * beat, 1);
      hat(oc, out, noise, i * beat + beat / 2, 0.22, true);
      if (i % 2 === 1) clap(oc, out, noise, i * beat, 0.55);
    }
    const bass = [45, 45, 57, 45, 48, 45, 55, 57, 45, 45, 57, 45, 52, 50, 48, 47];
    bass.forEach((n, i) => tone(oc, out, { type: "sawtooth", freq: NOTE(n), t: i * beat / 2, dur: beat / 2 - 0.03, gain: 0.32, filter: 900 }));
    [69, 72, 76, 81].forEach((n, i) => tone(oc, out, { type: "square", freq: NOTE(n), t: 3 * beat * 2 + i * beat / 2, dur: beat / 2 - 0.05, gain: 0.12, filter: 3000 }));
  } },

  // Referee-style pea whistle: short, short, looooong.
  whistle: { len: 2.1, build(oc, out) {
    for (const [t, d] of [[0, 0.18], [0.3, 0.18], [0.6, 0.85]]) {
      const o = oc.createOscillator();
      o.frequency.value = 2950;
      const lfo = oc.createOscillator();
      lfo.frequency.value = 38; // the rattle of the pea
      const depth = oc.createGain();
      depth.gain.value = 140;
      lfo.connect(depth).connect(o.frequency);
      const g = oc.createGain();
      env(g, t, d, 0.5, 0.01, 0.03);
      o.connect(g).connect(out);
      o.start(t); lfo.start(t);
      o.stop(t + d + 0.03); lfo.stop(t + d + 0.03);
    }
  } },

  // Retro video-game power-up arpeggios + coin.
  levelup: { len: 1.8, build(oc, out) {
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => tone(oc, out, { type: "square", freq: NOTE(n), t: i * 0.065, dur: 0.06, gain: 0.2, release: 0.005 }));
    [74, 78, 81, 86, 90, 93, 98].forEach((n, i) => tone(oc, out, { type: "square", freq: NOTE(n), t: 0.55 + i * 0.065, dur: 0.06, gain: 0.2, release: 0.005 }));
    tone(oc, out, { type: "square", freq: NOTE(83), t: 1.1, dur: 0.08, gain: 0.22 });
    tone(oc, out, { type: "square", freq: NOTE(88), t: 1.18, dur: 0.4, gain: 0.22, release: 0.3 });
  } },

  // Stadium air horn blasts.
  airhorn: { len: 2.0, drive: 2.2, build(oc, out) {
    const lp = oc.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600; lp.connect(out);
    for (const [t, d] of [[0, 0.75], [0.95, 0.25], [1.3, 0.25]]) {
      for (const [f, gain, type] of [[415, 0.3, "sawtooth"], [418.5, 0.3, "sawtooth"], [207.5, 0.18, "square"], [622, 0.1, "sawtooth"]]) {
        const o = oc.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f * 0.9, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        const g = oc.createGain();
        env(g, t, d, gain, 0.015, 0.04);
        o.connect(g).connect(lp);
        o.start(t); o.stop(t + d + 0.03);
      }
    }
  } },

  // Old bell telephone: brrring, brrring.
  phone: { len: 2.2, drive: 2.2, build(oc, out) {
    for (const [t0, d] of [[0, 0.45], [0.65, 0.45]]) {
      const g = oc.createGain();
      g.gain.setValueAtTime(0, t0);
      for (let k = 0; k * 0.025 < d; k++) g.gain.setValueAtTime(k % 2 ? 0.08 : 0.5, t0 + k * 0.025);
      g.gain.setValueAtTime(0, t0 + d);
      g.connect(out);
      for (const f of [1400, 1867, 2650]) {
        const o = oc.createOscillator();
        o.frequency.value = f;
        const og = oc.createGain();
        og.gain.value = f === 1400 ? 0.6 : 0.25;
        o.connect(og).connect(g);
        o.start(t0); o.stop(t0 + d + 0.02);
      }
    }
  } },

  // Bright marimba melody (gentle, then builds with the volume ramp).
  marimba: { len: 3.2, build(oc, out) {
    const mel = [[72, 0], [76, 0.2], [79, 0.4], [84, 0.6], [79, 0.9], [81, 1.1], [83, 1.3], [84, 1.5], [88, 1.9], [86, 2.1], [84, 2.3]];
    for (const [n, t] of mel) { marimba(oc, out, NOTE(n), t, 0.5); marimba(oc, out, NOTE(n - 12), t, 0.18); }
  } },

  // Chirping birds.
  birds: { len: 3.0, build(oc, out) {
    const chirps = [[0, 3600, 5000], [0.12, 3900, 5400], [0.24, 3700, 5100], [0.9, 4200, 3300], [1.02, 4200, 3300],
      [1.6, 3300, 5200], [1.7, 3500, 5600], [1.8, 3400, 5300], [1.9, 3600, 5800], [2.5, 5000, 4000]];
    for (const [t, f0, f1] of chirps) {
      const o = oc.createOscillator();
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.07);
      const g = oc.createGain();
      env(g, t, 0.08, 0.35, 0.005, 0.03);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.1);
    }
  } },
};

/** Soft saturation: makes punchy/peaky sounds (drums) as loud as steady tones. */
function saturate(buffer, k) {
  const norm = Math.tanh(k);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (!peak) continue;
    for (let i = 0; i < d.length; i++) d[i] = Math.tanh((k * d[i]) / peak) / norm;
  }
  return buffer;
}

function normalize(buffer, peakTarget = 0.95) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak > 0) {
    const k = peakTarget / peak;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) d[i] *= k;
    }
  }
  return buffer;
}

async function renderBuiltin(id) {
  const r = RECIPES[id] || RECIPES.classic;
  const sr = 44100;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const oc = new OAC(1, Math.ceil(r.len * sr), sr);
  r.build(oc, oc.destination);
  const buf = await oc.startRendering();
  if (r.drive) saturate(buf, r.drive);
  return normalize(buf);
}

/** Decodes an uploaded audio Blob. Throws if the browser can't read it. */
export async function decodeBlob(blob) {
  const data = await blob.arrayBuffer();
  const c = audioCtx();
  return await new Promise((resolve, reject) => {
    const p = c.decodeAudioData(data, resolve, reject); // callback form for older Safari
    if (p && p.then) p.then(resolve, reject);
  });
}

/** AudioBuffer for a sound id ("classic", or "custom:<uuid>"). Falls back to classic. */
export async function loadSound(id) {
  if (bufferCache.has(id)) return bufferCache.get(id);
  let buf = null;
  if (id && id.startsWith("custom:")) {
    try {
      const rec = await getSound(id);
      if (rec?.blob) buf = await decodeBlob(rec.blob);
    } catch (e) {
      console.warn("Custom sound failed, using built-in", e);
    }
  }
  if (!buf) buf = await renderBuiltin(BUILTIN_SOUNDS.some(s => s.id === id) ? id : "classic");
  bufferCache.set(id, buf);
  return buf;
}

export function forgetSound(id) { bufferCache.delete(id); }

// ---------- playback ----------

/** Looping alarm. Volume ramps up (optional) and can be "ducked" while the user exercises. */
export class AlarmPlayer {
  constructor(buffer, { ramp = true } = {}) {
    this.buffer = buffer;
    this.ramp = ramp;
    this.src = null;
  }
  start() {
    const c = audioCtx();
    this.stop();
    const now = c.currentTime;
    this.src = c.createBufferSource();
    this.src.buffer = this.buffer;
    this.src.loop = true;
    this.vol = c.createGain();
    this.duckGain = c.createGain();
    this.vol.gain.setValueAtTime(this.ramp ? 0.35 : 1, now);
    if (this.ramp) this.vol.gain.linearRampToValueAtTime(1, now + 25);
    this.src.connect(this.vol).connect(this.duckGain).connect(c.destination);
    this.src.start(now + 0.05);
  }
  duck(level) {
    if (!this.duckGain) return;
    const c = audioCtx();
    this.duckGain.gain.cancelScheduledValues(c.currentTime);
    this.duckGain.gain.setTargetAtTime(level, c.currentTime, 0.3);
  }
  get playing() { return !!this.src; }
  stop() {
    if (this.src) {
      try { this.src.stop(); } catch { /* already stopped */ }
      try { this.src.disconnect(); } catch { /* ignore */ }
    }
    this.src = null;
  }
}

let preview = null;
/** Plays a sound for a few seconds; calling again stops it. Returns true if now playing. */
export async function togglePreview(id) {
  if (preview) { stopPreview(); return false; }
  await unlockAudio();
  const buf = await loadSound(id);
  const c = audioCtx();
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.value = 0.8;
  src.connect(g).connect(c.destination);
  src.start();
  const timer = setTimeout(stopPreview, Math.max(3500, Math.min(buf.duration * 1000, 6000)));
  preview = { src, timer };
  return true;
}
export function stopPreview() {
  if (!preview) return;
  clearTimeout(preview.timer);
  try { preview.src.stop(); } catch { /* ignore */ }
  preview = null;
}

/** Short "ding" for each rep. */
export function ding(high = false) {
  if (!audioRunning()) return;
  const c = audioCtx();
  const t = c.currentTime;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = "sine";
  o.frequency.setValueAtTime(high ? 1568 : 1175, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.4);
}

/** Little victory jingle. */
export function successJingle() {
  if (!audioRunning()) return;
  const c = audioCtx();
  const t = c.currentTime + 0.05;
  [72, 76, 79, 84].forEach((n, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = "triangle";
    o.frequency.value = NOTE(n);
    const s = t + i * 0.12;
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(0.4, s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + (i === 3 ? 0.9 : 0.3));
    o.connect(g).connect(c.destination);
    o.start(s);
    o.stop(s + 1);
  });
}
