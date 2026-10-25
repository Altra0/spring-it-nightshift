"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Mic, Power, Radio, Send } from "lucide-react";
import { DeskCard, Empty, PageTitle, PillTabs } from "@/components/desk/card";
import { ItemIcon, NeedsYourCall, UrgencyChip } from "@/components/desk/chips";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { itemTitle, time } from "@/lib/desk/labels";
import type { Item } from "@/lib/desk/types";
import { cn } from "@/lib/utils";
import { beep, concat, dbfs, normalise, peak, resample, wav } from "@/lib/radio/audio";
import { aiocOutput, defaultInput, defaultOutput, listDevices, openInput, type Devices, type InputHandle } from "@/lib/radio/input";
import {
  TRANSMIT_LABEL, aiocConnected, aiocTransmitter, connectAioc, speakerTransmitter, webSerialSupported,
  type TransmitMode, type Transmitter,
} from "@/lib/radio/transmit";

type Phase = "off" | "listening" | "recording" | "thinking" | "speaking";
type Mode = "hold" | "auto";

type Settings = {
  inputId?: string; outputId?: string; aiocOutputId?: string;
  mode: Mode; transmit: TransmitMode; gainDb: number; thresholdDb: number;
};

type Entry = {
  id: string; at: string; heard?: string; reply?: string;
  item?: Pick<Item, "title" | "summary" | "category" | "location" | "urgency" | "managerDecides"> | null;
  action?: string; error?: string; pending?: boolean;
};

// The AB13X peaks around -42 dBFS on soft speech, so the default lifts it ~24 dB.
const DEFAULTS: Settings = { mode: "hold", transmit: "speaker", gainDb: 24, thresholdDb: -38 };
const SETTINGS_KEY = "si.radio.settings";
const FEED_KEY = "si.radio.feed";
const FEED_MAX = 40;

const PREROLL_S = 0.35; // audio kept from just before voice was detected
const VOICE_ON_S = 0.06; // this much loud audio starts a recording
const SILENCE_S = 1.0; // this much quiet ends one (auto mode)
const MIN_S = 0.4; // shorter recordings are dropped as clicks
const MAX_S = 30;
const AFTER_REPLY_MS = 400; // half duplex: stay deaf briefly after speaking

const PHASE_LABEL: Record<Phase, string> = {
  off: "Radio off",
  listening: "Listening",
  recording: "Hearing a report",
  thinking: "Logging it",
  speaking: "Replying",
};

const shiftId = () => `night-${new Date().toISOString().slice(0, 10)}`;
const newId = () => Math.random().toString(36).slice(2, 10);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

async function playBlob(blob: Blob, sinkId: string) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  try {
    if (sinkId && audio.setSinkId) await audio.setSinkId(sinkId);
    await new Promise<void>((resolve, reject) => {
      // Never stay deaf if an output device swallows the "ended" event.
      const guard = setTimeout(resolve, 30_000);
      audio.onended = () => {
        clearTimeout(guard);
        resolve();
      };
      audio.onerror = () => reject(new Error("Could not play audio"));
      audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function speakInBrowser(text: string) {
  return new Promise<void>((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-GB";
    u.onend = () => resolve();
    u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}

export function RadioView() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [feed, setFeed] = useState<Entry[]>([]);
  const [devices, setDevices] = useState<Devices>({ inputs: [], outputs: [] });
  const [phase, setPhase] = useState<Phase>("off");
  const [error, setError] = useState<string | null>(null);
  const [aioc, setAioc] = useState(false);
  const [typed, setTyped] = useState("");
  const [live, setLive] = useState(false);

  const meterRef = useRef<HTMLDivElement>(null);
  const levelText = useRef<HTMLSpanElement>(null);

  // The audio loop runs outside React; refs keep it reading the latest values.
  const s = useRef(settings);
  const phaseRef = useRef<Phase>("off");
  const input = useRef<InputHandle | null>(null);
  const level = useRef(-120);
  const rec = useRef<{ chunks: Float32Array[]; seconds: number; voiced: number; quiet: number; held: boolean } | null>(null);
  const preroll = useRef<Float32Array[]>([]);
  const loud = useRef(0);

  useEffect(() => {
    // Stored settings and feed are read after mount so prerendering stays clean.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettings(load(SETTINGS_KEY, DEFAULTS));
    setFeed(load<{ entries: Entry[] }>(FEED_KEY, { entries: [] }).entries.filter((e) => !e.pending));
  }, []);
  useEffect(() => {
    s.current = settings;
  }, [settings]);

  const update = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(SETTINGS_KEY, next);
      return next;
    });

  const setEntry = useCallback((id: string, patch: Partial<Entry>) => {
    setFeed((prev) => {
      const exists = prev.some((e) => e.id === id);
      const next = exists
        ? prev.map((e) => (e.id === id ? { ...e, ...patch } : e))
        : [{ id, at: new Date().toISOString(), ...patch }, ...prev].slice(0, FEED_MAX);
      save(FEED_KEY, { entries: next.filter((e) => !e.pending) });
      return next;
    });
  }, []);

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  const transmitter = useCallback((): Transmitter => {
    const cfg = s.current;
    return cfg.transmit === "aioc"
      ? aiocTransmitter(cfg.aiocOutputId ?? "")
      : speakerTransmitter(cfg.outputId ?? "");
  }, []);

  /** Half duplex: nothing is heard from the moment a reply starts until it ends. */
  const reply = useCallback(async (text: string) => {
    go("speaking");
    const tx = transmitter();
    const speech = fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    }).then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    try {
      await tx.keyUp();
      await playBlob(beep(tx.mode === "speaker" ? 0 : 150), tx.sinkId);
      const audio = await speech;
      if (audio) await playBlob(audio, tx.sinkId);
      else await speakInBrowser(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play the reply.");
    } finally {
      await tx.keyDown().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, AFTER_REPLY_MS));
  }, [transmitter]);

  /** Report text -> Stream A's agent -> spoken reply. */
  const send = useCallback(async (id: string, text: string, source: "radio" | "text") => {
    setEntry(id, { heard: text, pending: true });
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, shiftId: shiftId(), source }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? `Report failed (${res.status})`);
    setEntry(id, { reply: json.reply, item: json.item, action: json.action, pending: false });
    if (json.reply) await reply(json.reply);
  }, [reply, setEntry]);

  const finish = useCallback(async (chunks: Float32Array[], rate: number) => {
    const id = newId();
    go("thinking");
    try {
      const samples = resample(normalise(concat(chunks)), rate, 16000);
      setEntry(id, { pending: true });
      const form = new FormData();
      form.append("audio", wav(samples, 16000), "report.wav");
      const res = await fetch("/api/transcribe", { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `Transcription failed (${res.status})`);
      const text = (json.text as string)?.trim();
      if (!text) {
        setFeed((prev) => prev.filter((e) => e.id !== id));
      } else {
        await send(id, text, "radio");
      }
    } catch (err) {
      setEntry(id, { error: err instanceof Error ? err.message : "Something went wrong.", pending: false });
    } finally {
      if (phaseRef.current !== "off") go("listening");
    }
  }, [send, setEntry]);

  const startRecording = useCallback((held: boolean) => {
    if (phaseRef.current !== "listening") return;
    rec.current = { chunks: [...preroll.current], seconds: 0, voiced: 0, quiet: 0, held };
    preroll.current = [];
    go("recording");
  }, []);

  const stopRecording = useCallback(() => {
    const r = rec.current;
    rec.current = null;
    if (!r || phaseRef.current !== "recording") return;
    if (r.seconds < MIN_S || (!r.held && r.voiced < VOICE_ON_S)) return go("listening");
    void finish(r.chunks, input.current?.sampleRate ?? 48000);
  }, [finish]);

  const onChunk = useCallback((chunk: Float32Array) => {
    const handle = input.current;
    if (!handle) return;
    const cfg = s.current;
    const dur = chunk.length / handle.sampleRate;
    const db = dbfs(peak(chunk)) + cfg.gainDb;
    level.current = Math.max(db, level.current);
    const voice = db >= cfg.thresholdDb;
    const p = phaseRef.current;

    if (p === "listening") {
      preroll.current.push(chunk);
      let kept = preroll.current.reduce((n, c) => n + c.length, 0);
      while (kept > PREROLL_S * handle.sampleRate && preroll.current.length > 1) kept -= preroll.current.shift()!.length;
      loud.current = voice ? loud.current + dur : 0;
      if (cfg.mode === "auto" && loud.current >= VOICE_ON_S) startRecording(false);
      return;
    }
    if (p === "recording" && rec.current) {
      const r = rec.current;
      r.chunks.push(chunk);
      r.seconds += dur;
      if (voice) {
        r.voiced += dur;
        r.quiet = 0;
      } else r.quiet += dur;
      if ((!r.held && r.quiet >= SILENCE_S) || r.seconds >= MAX_S) stopRecording();
    }
  }, [startRecording, stopRecording]);

  const refreshDevices = useCallback(async () => {
    const list = await listDevices();
    setDevices(list);
    const cfg = s.current;
    const patch: Partial<Settings> = {};
    if (!list.inputs.some((d) => d.deviceId === cfg.inputId)) patch.inputId = defaultInput(list.inputs)?.deviceId;
    if (!list.outputs.some((d) => d.deviceId === cfg.outputId)) patch.outputId = defaultOutput(list.outputs)?.deviceId;
    if (!list.outputs.some((d) => d.deviceId === cfg.aiocOutputId)) patch.aiocOutputId = aiocOutput(list.outputs)?.deviceId;
    if (Object.keys(patch).length) update(patch);
    return { ...cfg, ...patch };
  }, []);

  const start = useCallback(async (inputId?: string) => {
    setError(null);
    input.current?.stop();
    input.current = null;
    try {
      // First open grants the permission that makes device names visible.
      const first = await openInput(inputId ?? s.current.inputId, onChunk).catch(() => openInput(undefined, onChunk));
      input.current = first;
      const cfg = await refreshDevices();
      if (!inputId && cfg.inputId && cfg.inputId !== s.current.inputId) {
        first.stop();
        input.current = await openInput(cfg.inputId, onChunk);
      }
      setLive(true);
      go("listening");
    } catch (err) {
      setLive(false);
      go("off");
      setError(err instanceof Error ? `Microphone: ${err.message}` : "Could not open the microphone.");
    }
  }, [onChunk, refreshDevices]);

  const stop = useCallback(() => {
    input.current?.stop();
    input.current = null;
    rec.current = null;
    setLive(false);
    go("off");
  }, []);

  useEffect(() => () => input.current?.stop(), []);

  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md) return;
    const onChange = () => void (phaseRef.current !== "off" && refreshDevices());
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, [refreshDevices]);

  // Meter: drawn straight to the DOM at frame rate, with a gentle fall-off.
  useEffect(() => {
    let raf = 0;
    let shown = -120;
    const tick = () => {
      shown = Math.max(level.current, shown - 1.2);
      level.current = -120;
      const pct = Math.max(0, Math.min(100, ((shown + 60) / 60) * 100));
      if (meterRef.current) meterRef.current.style.width = `${pct}%`;
      if (levelText.current) levelText.current.textContent = shown > -60 ? `${Math.round(shown)} dB` : "quiet";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Hold Space to talk (ignored while typing in a field).
  useEffect(() => {
    const typing = (e: KeyboardEvent) => (e.target as HTMLElement)?.closest("input, textarea, [role=combobox], [contenteditable]");
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || typing(e)) return;
      e.preventDefault();
      startRecording(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e)) return;
      e.preventDefault();
      if (rec.current?.held) stopRecording();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [startRecording, stopRecording]);

  async function sendTyped(e: React.FormEvent) {
    e.preventDefault();
    const text = typed.trim();
    if (!text || phase === "thinking" || phase === "speaking") return;
    setTyped("");
    const id = newId();
    const before = phaseRef.current;
    go("thinking");
    try {
      await send(id, text, "text");
    } catch (err) {
      setEntry(id, { error: err instanceof Error ? err.message : "Something went wrong.", pending: false });
    } finally {
      go(before === "off" ? "off" : "listening");
    }
  }

  async function chooseTransmit(mode: TransmitMode) {
    update({ transmit: mode });
    if (mode === "aioc") {
      try {
        setAioc(await connectAioc(false));
      } catch {}
    }
  }

  async function pairAioc() {
    setError(null);
    try {
      setAioc(await connectAioc(true));
      await refreshDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not connect the AIOC.");
    }
  }

  const on = live;
  const busy = phase === "thinking" || phase === "speaking";
  const thresholdPct = ((settings.thresholdDb + 60) / 60) * 100;
  const aiocReady = settings.transmit !== "aioc" || (aioc || aiocConnected());

  return (
    <>
      <PageTitle title="Radio" sub="Reports from the hand radio, logged by Spring It and answered out loud." />

      <div className="space-y-4">
        <DeskCard>
          <div className="flex flex-col items-center gap-5 pt-2 text-center">
            <div>
              <p className="text-sm text-muted-foreground">
                {settings.mode === "auto" ? "Starts when someone speaks" : "Hold Space or the button to talk"}
              </p>
              <p className="mt-1 text-3xl font-semibold tracking-tight" aria-live="polite">{PHASE_LABEL[phase]}</p>
            </div>

            <button
              type="button"
              disabled={!on || busy}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                startRecording(true);
              }}
              onPointerUp={() => rec.current?.held && stopRecording()}
              onPointerCancel={() => rec.current?.held && stopRecording()}
              className={cn(
                "flex size-28 touch-none select-none items-center justify-center rounded-full transition-all",
                "bg-si-tint text-si-neutral disabled:opacity-50",
                phase === "listening" && "hover:bg-si-neutral hover:text-white",
                phase === "recording" && "scale-105 bg-si-red text-white shadow-[0_0_0_10px_rgba(219,51,48,0.12)]",
                phase === "speaking" && "bg-si-neutral text-white",
              )}
              aria-label="Hold to talk"
            >
              {phase === "thinking" ? <Loader2 className="size-9 animate-spin" /> : phase === "speaking" ? <Radio className="size-9" /> : <Mic className="size-9" />}
            </button>

            <div className="w-full max-w-sm">
              <div className="relative h-2.5 overflow-hidden rounded-full bg-si-tint">
                <div
                  ref={meterRef}
                  className={cn("h-full rounded-full transition-[background-color]", phase === "recording" ? "bg-si-red" : "bg-si-neutral")}
                  style={{ width: "0%" }}
                />
                <div className="absolute inset-y-0 w-0.5 bg-si-text/40" style={{ left: `${thresholdPct}%` }} title="Voice threshold" />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                <span>Input level</span>
                <span ref={levelText} className="tabular-nums">quiet</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <PillTabs
                value={settings.mode}
                onChange={(mode) => update({ mode })}
                options={[{ value: "hold", label: "Hold to talk" }, { value: "auto", label: "Auto" }]}
              />
              {on ? (
                <Button variant="secondary" className="rounded-full" onClick={stop}>
                  <Power className="size-4" /> Stop
                </Button>
              ) : (
                <Button className="rounded-full" onClick={() => void start()}>
                  <Power className="size-4" /> Start radio
                </Button>
              )}
            </div>

            {!aiocReady && (
              <p className="text-sm text-si-red">Transmit is set to the radio, but the AIOC isn&apos;t connected. Replies won&apos;t go out.</p>
            )}
            {error && <p className="text-sm text-si-red">{error}</p>}
          </div>
        </DeskCard>

        <DeskCard label="Heard tonight">
          <form onSubmit={sendTyped} className="mb-3 flex gap-2">
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Or type a report"
              className="h-10 rounded-full bg-si-page px-4"
            />
            <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={!typed.trim() || busy} aria-label="Send report">
              <Send className="size-4" />
            </Button>
          </form>
          {feed.length === 0 ? (
            <Empty title="Nothing heard yet">Reports from the hand radio show up here with Spring It&apos;s reply.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {feed.map((e) => <FeedRow key={e.id} entry={e} />)}
            </ul>
          )}
        </DeskCard>

        <DeskCard label="Radio settings">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Listen on">
              <DeviceSelect
                list={devices.inputs}
                value={settings.inputId}
                placeholder={on ? "No inputs found" : "Start radio to see devices"}
                onChange={(inputId) => {
                  update({ inputId });
                  if (on) void start(inputId);
                }}
              />
            </Field>
            <Field label="Transmit">
              <Select value={settings.transmit} onValueChange={(v) => void chooseTransmit(v as TransmitMode)}>
                <SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRANSMIT_LABEL) as TransmitMode[]).map((m) => (
                    <SelectItem key={m} value={m}>{TRANSMIT_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {settings.transmit === "speaker" ? (
              <Field label="Reply on">
                <DeviceSelect
                  list={devices.outputs}
                  value={settings.outputId}
                  placeholder={on ? "No outputs found" : "Start radio to see devices"}
                  onChange={(outputId) => update({ outputId })}
                />
              </Field>
            ) : (
              <Field label="AIOC sound card">
                <div className="flex gap-2">
                  <DeviceSelect
                    list={devices.outputs}
                    value={settings.aiocOutputId}
                    placeholder="Plug in the AIOC"
                    onChange={(aiocOutputId) => update({ aiocOutputId })}
                  />
                  <Button variant="secondary" className="h-10 shrink-0 rounded-xl" onClick={pairAioc} disabled={!webSerialSupported()}>
                    {aioc || aiocConnected() ? "Connected" : "Connect"}
                  </Button>
                </div>
              </Field>
            )}
            <Field label={`Input gain · +${settings.gainDb} dB`}>
              <Range min={0} max={40} value={settings.gainDb} onChange={(gainDb) => update({ gainDb })} />
            </Field>
            <Field label={`Voice threshold · ${settings.thresholdDb} dB`}>
              <Range min={-60} max={-10} value={settings.thresholdDb} onChange={(thresholdDb) => update({ thresholdDb })} />
            </Field>
          </div>
        </DeskCard>
      </div>
    </>
  );
}

function FeedRow({ entry: e }: { entry: Entry }) {
  const title = e.item
    ? itemTitle(e.item)
    : e.action === "handOver"
      ? "Handed over"
      : e.error
        ? "Not logged"
        : e.pending
          ? (e.heard ? "Logging it…" : "Listening back…")
          : "Heard";
  return (
    <li className="flex gap-3 py-3">
      {e.item ? (
        <ItemIcon item={e.item} className="size-10" iconClassName="size-[18px]" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-si-tint text-si-neutral">
          {e.pending ? <Loader2 className="size-[18px] animate-spin" /> : <Radio className="size-[18px]" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium leading-snug">{title}</p>
          <span className="flex shrink-0 items-center gap-1.5">
            {e.item?.managerDecides && <NeedsYourCall />}
            {e.item && <UrgencyChip urgency={e.item.urgency} />}
          </span>
        </div>
        {e.heard && <p className="mt-0.5 text-sm text-muted-foreground">Heard: “{e.heard}”</p>}
        {e.reply && <p className="mt-0.5 text-sm text-si-text">Spring It: “{e.reply}”</p>}
        {e.error && <p className="mt-0.5 text-sm text-si-red">{e.error}</p>}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[e.item?.location, time(e.at)].filter(Boolean).join(" · ")}
        </p>
      </div>
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function DeviceSelect({
  list, value, placeholder, onChange,
}: { list: MediaDeviceInfo[]; value?: string; placeholder: string; onChange: (id: string) => void }) {
  const known = list.some((d) => d.deviceId === value);
  return (
    <Select value={known ? value : undefined} onValueChange={onChange} disabled={list.length === 0}>
      <SelectTrigger className="h-10 w-full min-w-0 rounded-xl"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {list.map((d) => (
          <SelectItem key={d.deviceId} value={d.deviceId}>{d.label || "Unnamed device"}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Range({ min, max, value, onChange }: { min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={1}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-10 w-full accent-[var(--si-neutral)]"
    />
  );
}
