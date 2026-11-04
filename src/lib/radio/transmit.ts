"use client";

// Where Spring It's spoken reply goes. Swapping the speaker for the real radio is a
// setting, not a code change.
//
//  - "speaker": play on the chosen output (the iMac speakers). For testing without a radio.
//  - "aioc":    play on the AIOC's sound card and key the wired radio's PTT through the
//               AIOC's serial port, the same DTR=1 / RTS=0 rule and timing as radio/bridge.py,
//               done here with Web Serial (Chrome / Edge). Run either this page or bridge.py,
//               not both: only one of them can hold the AIOC's serial port.

export type TransmitMode = "speaker" | "aioc";

export const TRANSMIT_LABEL: Record<TransmitMode, string> = {
  speaker: "Speaker",
  aioc: "Radio via AIOC",
};

export interface Transmitter {
  mode: TransmitMode;
  /** Output device id the reply audio plays on ("" = system default). */
  sinkId: string;
  /** Key up before audio starts; resolves once the radio is transmitting. */
  keyUp(): Promise<void>;
  keyDown(): Promise<void>;
}

export function speakerTransmitter(sinkId: string): Transmitter {
  return { mode: "speaker", sinkId, keyUp: async () => {}, keyDown: async () => {} };
}

// Minimal Web Serial types (not in TypeScript's DOM lib yet).
type SerialPortLike = {
  open(o: { baudRate: number }): Promise<void>;
  setSignals(s: { dataTerminalReady?: boolean; requestToSend?: boolean }): Promise<void>;
  close(): Promise<void>;
  readable: unknown; // non-null while this page has the port open
};
type SerialLike = { requestPort(): Promise<SerialPortLike>; getPorts(): Promise<SerialPortLike[]> };
const serial = () => (navigator as unknown as { serial?: SerialLike }).serial;

export const webSerialSupported = () => typeof navigator !== "undefined" && !!serial();

let port: SerialPortLike | null = null;

/** Ask for the AIOC's serial port (needs a click). Reuses a port granted earlier. */
export async function connectAioc(prompt = true) {
  const s = serial();
  if (!s) throw new Error("This browser can't key the radio. Use Chrome or Edge, or run radio/bridge.py.");
  if (port) return true;
  const granted = (await s.getPorts())[0] ?? (prompt ? await s.requestPort() : null);
  if (!granted) return false;
  // After a hot reload or a remount this page may still hold the port open. Reuse it:
  // calling open() again would fail.
  if (!granted.readable) {
    try {
      await granted.open({ baudRate: 9600 });
    } catch (err) {
      throw new Error(
        "The AIOC's serial port is busy. Close any other tab that has the radio page open " +
          `(or anything else using the AIOC), then try again. (${err instanceof Error ? err.message : err})`,
      );
    }
    // Let go of the port when the tab closes or reloads, so the next load can open it.
    window.addEventListener("pagehide", () => void granted.close().catch(() => {}), { once: true });
  }
  await granted.setSignals({ dataTerminalReady: false, requestToSend: false });
  port = granted;
  return true;
}

export const aiocConnected = () => !!port;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function aiocTransmitter(sinkId: string): Transmitter {
  return {
    mode: "aioc",
    sinkId,
    async keyUp() {
      if (!port) throw new Error("AIOC not connected");
      await port.setSignals({ dataTerminalReady: true, requestToSend: false });
      await wait(300); // radio needs a moment before audio, or the first word is clipped (bridge.py key_up_delay)
    },
    async keyDown() {
      await wait(300); // let the last word clear the radio before unkeying (bridge.py tail)
      await port?.setSignals({ dataTerminalReady: false, requestToSend: false });
    },
  };
}
