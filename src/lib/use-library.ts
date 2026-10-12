"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { syncSchema, type Library } from "./model";
import { openDeviceDatabase } from "./device-database";
import { DeviceLibrarySession, emptyDeviceState } from "./device-library";
import { createLibraryBackup } from "./library-backup";

export function downloadLibrary(library: Library) {
  const url = URL.createObjectURL(
    new Blob([createLibraryBackup(library)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `bookit-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useLibrary() {
  const [state, setState] = useState(emptyDeviceState);
  const current = useRef<DeviceLibrarySession | null>(null);

  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      /* IndexedDB can still work. */
    }
    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel("bookit-device-library");
      }
    } catch {
      /* Focus refresh still supports browsers without tab messaging. */
    }
    const session = new DeviceLibrarySession({
      open: () => openDeviceDatabase(),
      storage,
      // Import SQLite on first use, or check a clean legacy cache once during migration.
      // Once migrated, every read and write is on this device, with no HTTP requests.
      bootstrap: async (legacy) => {
        const response = await fetch("/api/library", {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        if (!response.ok) throw new Error("Existing library unavailable.");
        const snapshot = syncSchema.parse(await response.json());
        return legacy && snapshot.revision < legacy.revision ? legacy.library : snapshot.library;
      },
      committed: () => channel?.postMessage("updated"),
    });
    current.current = session;
    const unsubscribe = session.subscribe(() => setState(session.getState()));
    void session.initialize();
    const refresh = () => {
      void session.refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const protectUnsaved = (event: BeforeUnloadEvent) => {
      if (!session.hasUnprotectedEdits()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    channel?.addEventListener("message", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("beforeunload", protectUnsaved);
    document.addEventListener("visibilitychange", visible);
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
    return () => {
      unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("beforeunload", protectUnsaved);
      document.removeEventListener("visibilitychange", visible);
      channel?.close();
      session.dispose();
      if (current.current === session) current.current = null;
    };
  }, []);

  const update = useCallback((mutate: (library: Library) => Library) => {
    current.current?.update(mutate);
  }, []);
  const resolveConflict = useCallback((choice: "device" | "saved") => {
    const session = current.current;
    const snapshot = session?.getState();
    if (!session || !snapshot?.conflict) return;
    downloadLibrary(choice === "saved" ? snapshot.library : snapshot.conflict.library);
    void session.resolveConflict(choice);
  }, []);
  const clearError = useCallback(() => current.current?.clearError(), []);

  return { ...state, update, resolveConflict, clearError };
}
