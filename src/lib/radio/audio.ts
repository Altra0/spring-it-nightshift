// Small PCM helpers for the radio page: levels, normalisation, WAV encoding, the beep.

export const dbfs = (amp: number) => (amp <= 1e-6 ? -120 : 20 * Math.log10(amp));
export const fromDb = (db: number) => Math.pow(10, db / 20);

export function peak(samples: Float32Array) {
  let p = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]);
    if (a > p) p = a;
  }
  return p;
}

export function meanSquare(samples: Float32Array) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? sum / samples.length : 0;
}

export function concat(chunks: Float32Array[]) {
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Peak-normalise to `targetDb`, never boosting more than `maxBoostDb` (so silence stays quiet). */
export function normalise(samples: Float32Array, targetDb = -1, maxBoostDb = 40) {
  const p = peak(samples);
  if (p === 0) return samples;
  const gain = Math.min(fromDb(targetDb) / p, fromDb(maxBoostDb));
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

/** Linear-interpolation resample; plenty for speech going to transcription. */
export function resample(samples: Float32Array, from: number, to: number) {
  if (from === to) return samples;
  const ratio = from / to;
  const out = new Float32Array(Math.floor(samples.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    out[i] = samples[i0] + (samples[i1] - samples[i0]) * (x - i0);
  }
  return out;
}

/** 16-bit mono WAV. */
export function wav(samples: Float32Array, rate: number) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

/** The short two-tone beep before every reply. Leading silence gives VOX time to key. */
export function beep(leadMs = 0) {
  const rate = 24000;
  const lead = Math.round((leadMs / 1000) * rate);
  const tone = (hz: number, ms: number) => {
    const n = Math.round((ms / 1000) * rate);
    return Float32Array.from({ length: n }, (_, i) => {
      const env = Math.min(1, i / 240, (n - i) / 240);
      return 0.35 * env * Math.sin((2 * Math.PI * hz * i) / rate);
    });
  };
  return wav(concat([new Float32Array(lead), tone(988, 90), new Float32Array(rate * 0.03), tone(1319, 120)]), rate);
}

/**
 * Level a spoken reply for the wired radio's mic input: peak-normalise to -3 dBFS, then
 * scale by `gain`. Same as radio/bridge.py (tts_peak_db -3, output_gain 0.85), which
 * Ese tuned by ear over the hand radio on 4 Nov. Falls back to the original audio if
 * the browser can't decode it.
 */
export async function levelForRadio(audio: Blob, gain = 0.85, peakDb = -3): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await audio.arrayBuffer());
    const mono = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < ch.length; i++) mono[i] += ch[i] / buf.numberOfChannels;
    }
    const out = normalise(mono, peakDb, 12);
    for (let i = 0; i < out.length; i++) out[i] *= gain;
    return wav(out, buf.sampleRate);
  } catch {
    return audio;
  } finally {
    void ctx.close();
  }
}
