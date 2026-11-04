"use client";

// The AIOC's COS line ("carrier operated squelch": the wired radio is receiving), read
// with WebHID in Chrome / Edge. The AIOC presents itself as a CM108-style USB sound card
// and reports COS as the CM108 "volume down" button: bit 0x02 of the first byte of each
// HID input report. Same as Cos in radio/bridge.py.
//
// On the ESY082, COS can stay on for seconds after a call and bounces off for ~50 ms at
// release, so the radio page uses COS together with the audio level, never alone.

const AIOC = { vendorId: 0x1209, productId: 0x7388 };
const COS_BIT = 0x02;

type HidDeviceLike = {
  opened: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
  addEventListener(type: "inputreport", fn: (e: { data: DataView }) => void): void;
};
type HidLike = {
  requestDevice(o: { filters: { vendorId: number; productId: number }[] }): Promise<HidDeviceLike[]>;
  getDevices(): Promise<HidDeviceLike[]>;
};
const hid = () => (navigator as unknown as { hid?: HidLike }).hid;

export const webHidSupported = () => typeof navigator !== "undefined" && !!hid();

let device: HidDeviceLike | null = null;
let cos = false;
let heard = false;

/** True while the wired radio is receiving. Always false when COS isn't connected. */
export const cosOn = () => cos;
export const cosConnected = () => !!device;
/**
 * COS has reported at least once. The AIOC only sends a report when COS changes, and the
 * browser may withhold reports from some HID collections, so until one arrives the page
 * treats COS as unknown and falls back to voice level instead of never starting.
 */
export const cosLive = () => heard;

/** Ask for the AIOC's HID interface (needs a click unless granted before). */
export async function connectCos(prompt = true) {
  const h = hid();
  if (!h) return false;
  if (device) return true;
  const isAioc = (d: HidDeviceLike & { vendorId?: number; productId?: number }) =>
    d.vendorId === AIOC.vendorId && d.productId === AIOC.productId;
  const granted = (await h.getDevices()).filter(isAioc);
  const list = granted.length ? granted : prompt ? await h.requestDevice({ filters: [AIOC] }) : [];
  if (!list.length) return false;
  for (const d of list) {
    if (!d.opened) await d.open();
    d.addEventListener("inputreport", (e) => {
      if (!e.data.byteLength) return;
      heard = true;
      cos = (e.data.getUint8(0) & COS_BIT) !== 0;
    });
  }
  window.addEventListener("pagehide", () => list.forEach((d) => void d.close().catch(() => {})), { once: true });
  device = list[0];
  return true;
}
