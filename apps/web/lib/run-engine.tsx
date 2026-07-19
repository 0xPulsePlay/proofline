"use client";
/**
 * Client run engine: loads recorded run manifests (replay), or attaches to a
 * live coordinator SSE stream when NEXT_PUBLIC_COORDINATOR_URL is set.
 * Replay plays events on their REAL recorded timestamps (long gaps compressed
 * for watchability — never invented delays, only shortened real ones).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { RunEvent, RunManifest } from "@proofline/event-model";
import {
  VERIFICATION_BOUNDARIES,
  EXPLAIN,
  replayTo,
  type ControlRoomState,
} from "@proofline/event-model";

export type Mode = "replay" | "inspect" | "live";

export interface RunEngine {
  manifest: RunManifest | null;
  runIds: string[];
  loadRun: (id: string) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  liveAvailable: boolean;
  events: RunEvent[]; // visible slice
  allEvents: RunEvent[];
  state: ControlRoomState;
  cursor: number; // index into allEvents (-1 = before start)
  playing: boolean;
  play: () => void;
  pause: () => void;
  restart: () => void;
  scrubTo: (i: number) => void;
  speed: number;
  setSpeed: (s: number) => void;
  boundaryPause: boolean;
  setBoundaryPause: (b: boolean) => void;
  boundaryNote: string | null;
  expert: boolean;
  setExpert: (b: boolean) => void;
  nowMs: number;
}

const Ctx = createContext<RunEngine | null>(null);

export function useRun(): RunEngine {
  const c = useContext(Ctx);
  if (!c) throw new Error("useRun outside RunProvider");
  return c;
}

const COORD = process.env.NEXT_PUBLIC_COORDINATOR_URL || "";

export function RunProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<RunManifest | null>(null);
  const [runIds, setRunIds] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("replay");
  const [cursor, setCursor] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [boundaryPause, setBoundaryPause] = useState(false);
  const [boundaryNote, setBoundaryNote] = useState<string | null>(null);
  const [expert, setExpert] = useState(false);
  const [liveEvents, setLiveEvents] = useState<RunEvent[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPlayed = useRef(false);

  // Auto-play the bundled replay on first load — a judge with no backend
  // sees the full run without touching anything.
  useEffect(() => {
    if (manifest && mode === "replay" && !autoPlayed.current) {
      autoPlayed.current = true;
      setPlaying(true);
    }
  }, [manifest, mode]);

  // discover + load runs
  useEffect(() => {
    fetch("/runs/index.json")
      .then((r) => r.json())
      .then((idx: { runs: string[]; default?: string }) => {
        setRunIds(idx.runs);
        const id = idx.default ?? idx.runs[0];
        if (id) return fetch(`/runs/${id}/manifest.json`).then((r) => r.json());
      })
      .then((m) => m && setManifest(m))
      .catch(() => setManifest(null));
  }, []);

  const loadRun = useCallback((id: string) => {
    setPlaying(false);
    setCursor(-1);
    fetch(`/runs/${id}/manifest.json`)
      .then((r) => r.json())
      .then(setManifest)
      .catch(() => {});
  }, []);

  // live SSE
  useEffect(() => {
    if (mode !== "live" || !COORD) return;
    setLiveEvents([]);
    const es = new EventSource(`${COORD}/events`);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as RunEvent;
      setLiveEvents((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]));
    };
    return () => es.close();
  }, [mode]);

  const allEvents = useMemo<RunEvent[]>(
    () => (mode === "live" ? liveEvents : (manifest?.events ?? [])),
    [mode, liveEvents, manifest],
  );

  // replay scheduler — real recorded gaps, compressed to ≤2.5s, scaled by speed
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!playing || mode === "live") return;
    if (cursor >= allEvents.length - 1) {
      setPlaying(false);
      return;
    }
    const next = allEvents[cursor + 1];
    const prevAt = cursor >= 0 ? allEvents[cursor].at : next.at;
    const gap = Math.min(Math.max(next.at - prevAt, 0), 2500);
    timer.current = setTimeout(
      () => {
        setCursor((c) => c + 1);
        if (
          boundaryPause &&
          VERIFICATION_BOUNDARIES.includes(next.event.type)
        ) {
          setPlaying(false);
          setBoundaryNote(EXPLAIN[next.event.type]);
        }
      },
      Math.max(gap / speed, 140),
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, cursor, allEvents, speed, boundaryPause, mode]);

  const effectiveCursor = mode === "live" ? allEvents.length - 1 : cursor;
  const events = useMemo(
    () => allEvents.slice(0, effectiveCursor + 1),
    [allEvents, effectiveCursor],
  );
  const state = useMemo(
    () => replayTo(allEvents, effectiveCursor >= 0 ? allEvents[effectiveCursor]?.seq ?? -1 : -1),
    [allEvents, effectiveCursor],
  );

  const value: RunEngine = {
    manifest,
    runIds,
    loadRun,
    mode,
    setMode: (m) => {
      setMode(m);
      if (m === "inspect") setPlaying(false);
    },
    liveAvailable: !!COORD,
    events,
    allEvents,
    state,
    cursor: effectiveCursor,
    playing,
    play: () => {
      setBoundaryNote(null);
      if (cursor >= allEvents.length - 1) setCursor(-1);
      setPlaying(true);
    },
    pause: () => setPlaying(false),
    restart: () => {
      setBoundaryNote(null);
      setCursor(-1);
      setPlaying(true);
    },
    scrubTo: (i) => {
      setPlaying(false);
      setBoundaryNote(null);
      setCursor(Math.max(-1, Math.min(i, allEvents.length - 1)));
    },
    speed,
    setSpeed,
    boundaryPause,
    setBoundaryPause,
    boundaryNote,
    expert,
    setExpert,
    nowMs: events.length ? events[events.length - 1].at : Date.now(),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
