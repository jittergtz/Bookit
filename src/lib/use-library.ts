"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { librarySchema, type Library, type Snapshot } from "./model";

type Envelope = Snapshot & { dirty: boolean; generation: number };
export type SaveStatus = "loading" | "saved" | "saving" | "offline" | "error" | "conflict";
const STORAGE_KEY = "bookit-library-v1";

export function downloadLibrary(library: Library) {
  const url = URL.createObjectURL(
    new Blob(
      [JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), library }, null, 2)],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `bookit-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useLibrary() {
  const [library, setLibrary] = useState<Library>({ books: [], collections: [] });
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState<Snapshot | null>(null);
  const current = useRef<Envelope | null>(null);
  const syncing = useRef(false);
  const conflictRef = useRef<Snapshot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);

  const persist = useCallback((envelope: Envelope) => {
    current.current = envelope;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } catch {
      setError("Device storage is full. Export a backup and free space before adding more.");
    }
  }, []);

  const sync = useCallback(
    async (refresh = false) => {
      const draft = current.current;
      if (!draft || (!draft.dirty && !refresh) || syncing.current || conflictRef.current) return;
      if (!navigator.onLine) {
        setStatus("offline");
        return;
      }
      syncing.current = true;
      setStatus("saving");
      try {
        const response = await fetch(
          "/api/library",
          draft.dirty
            ? {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                signal: AbortSignal.timeout(12_000),
                body: JSON.stringify({ revision: draft.revision, library: draft.library }),
              }
            : { cache: "no-store", signal: AbortSignal.timeout(12_000) },
        );
        const data = await response.json();
        if (!alive.current) return;
        if (response.status === 409) {
          // A lost successful response can leave a draft marked dirty. If the
          // server already has exactly that library, acknowledge it safely.
          if (JSON.stringify(data.library) === JSON.stringify(current.current?.library)) {
            persist({ ...current.current!, revision: data.revision, dirty: false });
            setStatus("saved");
            setError("");
            return;
          }
          conflictRef.current = data;
          setConflict(data);
          setStatus("conflict");
          return;
        }
        if (!response.ok) {
          setStatus("offline");
          return;
        }
        const latest = current.current!;
        if (!draft.dirty) {
          if (latest.dirty && latest.revision !== data.revision) {
            conflictRef.current = data;
            setConflict(data);
            setStatus("conflict");
            return;
          }
          if (!latest.dirty) {
            persist({
              ...latest,
              library: librarySchema.parse(data.library),
              revision: data.revision,
            });
            setLibrary(data.library);
            setStatus("saved");
          }
        } else {
          persist({
            ...latest,
            revision: data.revision,
            dirty: latest.generation !== draft.generation,
          });
          setStatus(latest.generation === draft.generation ? "saved" : "saving");
        }
        setError("");
      } catch {
        if (!alive.current) return;
        setStatus("offline");
      } finally {
        syncing.current = false;
      }
    },
    [persist],
  );

  useEffect(() => {
    alive.current = true;
    async function initialize() {
      let cached: Envelope | null = null;
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const candidate = JSON.parse(raw);
          cached = {
            library: librarySchema.parse(candidate.library),
            revision: Number(candidate.revision) || 0,
            dirty: Boolean(candidate.dirty),
            generation: Number(candidate.generation) || 0,
          };
          current.current = cached;
          setLibrary(cached.library);
          setReady(true);
          setStatus(cached.dirty ? "saving" : "saved");
        }
      } catch {
        setError("The saved device cache could not be read. We’ll try your SQLite library.");
      }
      try {
        const response = await fetch("/api/library", {
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        if (!response.ok) throw new Error("The local SQLite database is unavailable.");
        const remote: Snapshot = await response.json();
        remote.library = librarySchema.parse(remote.library);
        if (!alive.current) return;
        // A user may have started typing while the initial request was in flight.
        const latest = current.current;
        if (latest?.dirty) {
          if (latest.revision !== remote.revision) {
            conflictRef.current = remote;
            setConflict(remote);
            setStatus("conflict");
          } else await sync();
        } else {
          persist({ ...remote, dirty: false, generation: 0 });
          setLibrary(remote.library);
          setStatus("saved");
        }
      } catch {
        if (!alive.current) return;
        if (!cached) {
          persist({
            library: { books: [], collections: [] },
            revision: 0,
            dirty: false,
            generation: 0,
          });
        }
        setStatus("offline");
      } finally {
        if (alive.current) setReady(true);
      }
    }
    void initialize();
    const reconnect = () => {
      void sync(true);
    };
    const disconnect = () => setStatus("offline");
    const interval = setInterval(() => {
      void sync();
    }, 5000);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => {
      alive.current = false;
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
    };
  }, [persist, sync]);

  const update = useCallback(
    (mutate: (library: Library) => Library) => {
      const previous = current.current;
      if (!previous) return;
      const next = librarySchema.parse(mutate(previous.library));
      persist({ ...previous, library: next, dirty: true, generation: previous.generation + 1 });
      setLibrary(next);
      setStatus(conflictRef.current ? "conflict" : navigator.onLine ? "saving" : "offline");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void sync();
      }, 750);
    },
    [persist, sync],
  );

  const resolveConflict = useCallback(
    (choice: "device" | "server") => {
      const remote = conflictRef.current;
      if (!remote || !current.current) return;
      if (choice === "server") {
        downloadLibrary(current.current.library);
        persist({ ...remote, dirty: false, generation: current.current.generation + 1 });
        setLibrary(remote.library);
        setStatus("saved");
      } else {
        downloadLibrary(remote.library);
        persist({ ...current.current, revision: remote.revision, dirty: true });
        setStatus("saving");
      }
      conflictRef.current = null;
      setConflict(null);
      if (choice === "device") void sync();
    },
    [persist, sync],
  );

  return {
    library,
    ready,
    status,
    error,
    conflict,
    update,
    retry: () => sync(true),
    resolveConflict,
    clearError: () => setError(""),
  };
}
