"use client";

// Microphone side of the radio page. Taps raw PCM from the chosen input (the AB13X
// card by default) with an AudioWorklet. Browser processing is off so the radio's
// audio arrives untouched; gain is applied in software for the meter and voice
// detection, and recordings are normalised before transcription.

const TAP = `
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("si-tap", Tap);
`;

export type InputHandle = {
  sampleRate: number;
  stop: () => void;
};

export async function openInput(deviceId: string | undefined, onChunk: (chunk: Float32Array) => void): Promise<InputHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([TAP], { type: "text/javascript" }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const src = ctx.createMediaStreamSource(stream);
  const tap = new AudioWorkletNode(ctx, "si-tap");
  tap.port.onmessage = (e) => onChunk(e.data as Float32Array);
  // Keep the tap in a rendered graph without making a sound.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(tap).connect(mute).connect(ctx.destination);
  return {
    sampleRate: ctx.sampleRate,
    stop: () => {
      tap.port.onmessage = null;
      stream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}

export type Devices = { inputs: MediaDeviceInfo[]; outputs: MediaDeviceInfo[] };

export async function listDevices(): Promise<Devices> {
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: all.filter((d) => d.kind === "audioinput" && d.deviceId),
    outputs: all.filter((d) => d.kind === "audiooutput" && d.deviceId),
  };
}

const has = (d: MediaDeviceInfo, ...words: string[]) => words.some((w) => d.label.toLowerCase().includes(w));

/** AB13X card for input; the iMac's own speakers for output (not the USB card). */
export function defaultInput(list: MediaDeviceInfo[]) {
  return list.find((d) => has(d, "ab13x", "usb audio")) ?? list.find((d) => d.deviceId === "default") ?? list[0];
}
export function defaultOutput(list: MediaDeviceInfo[]) {
  return (
    list.find((d) => has(d, "imac", "macbook", "built-in", "internal speakers") && !has(d, "usb")) ??
    list.find((d) => d.deviceId === "default") ??
    list[0]
  );
}
export function aiocOutput(list: MediaDeviceInfo[]) {
  return list.find((d) => has(d, "all-in-one", "aioc"));
}
