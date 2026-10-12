import { z } from "zod";
import { librarySchema, newId, type Library, type Snapshot } from "./model";
import { seedLibrary } from "./seed";
import { DeviceConflict, validateDeviceLibrary, type DeviceDatabase } from "./device-database";

export const LEGACY_STORAGE_KEY = "bookit-library-v1";
export const RECOVERY_PREFIX = "bookit-recovery-v2-";
const recoverySchema = z.object({
  baseRevision: z.number().int().nonnegative(),
  updatedAt: z.number(),
  sequence: z.number().int().nonnegative(),
  library: librarySchema,
});

export type DeviceLibraryState = {
  library: Library;
  ready: boolean;
  error: string;
  conflict: Snapshot | null;
};
export const emptyDeviceState: DeviceLibraryState = {
  library: { books: [], collections: [] },
  ready: false,
  error: "",
  conflict: null,
};

export class DeviceLibrarySession {
  private state = emptyDeviceState;
  private revision = 0;
  private pending: { library: Library; sequence: number } | null = null;
  private sequence = 0;
  private listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private saving: Promise<void> | null = null;
  private database: DeviceDatabase | null = null;
  private disposed = false;
  private recoveredKeys: { key: string; sequence: number }[] = [];
  private migratedLegacy: string | null = null;
  private journalKey: string;
  private journalSequence = 0;

  constructor(
    private options: {
      open: () => Promise<DeviceDatabase>;
      storage: Storage | null;
      bootstrap?: (legacy?: Snapshot) => Promise<Library>;
      committed?: () => void;
    },
  ) {
    this.journalKey = `${RECOVERY_PREFIX}${newId()}`;
  }

  getState = () => this.state;
  hasUnprotectedEdits = () => !!this.pending && this.pending.sequence !== this.journalSequence;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<DeviceLibraryState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  initialize() {
    return (this.initialization ??= this.load());
  }

  private async load() {
    try {
      this.database = await this.options.open();
      const saved = await this.database.read();
      if (this.disposed) return;
      this.revision = saved?.revision ?? 0;
      if (saved) this.publish({ library: saved.library });
      const recoveries: { key: string; draft: z.infer<typeof recoverySchema> }[] = [];
      const storage = this.options.storage;
      if (storage) {
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (!key?.startsWith(RECOVERY_PREFIX)) continue;
          const result = recoverySchema.safeParse(JSON.parse(storage.getItem(key)!));
          if (!result.success) throw new Error("A recovery copy could not be read.");
          if (!(await this.database.committedRecovery(key, result.data.sequence))) {
            recoveries.push({ key, draft: result.data });
          }
        }
      }
      recoveries.sort((a, b) => b.draft.updatedAt - a.draft.updatedAt);
      const distinct = recoveries.filter(
        (item) => JSON.stringify(item.draft.library) !== JSON.stringify(saved?.library),
      );
      const recovered = distinct[0];
      if (recovered) {
        this.recoveredKeys = [{ key: recovered.key, sequence: recovered.draft.sequence }];
        this.pending = { library: recovered.draft.library, sequence: ++this.sequence };
        this.publish({ library: recovered.draft.library, ready: true });
        this.journal();
        if (saved && (recovered.draft.baseRevision !== saved.revision || distinct.length > 1)) {
          this.publish({ conflict: saved });
        } else await this.flush();
        return;
      }
      if (saved) {
        // Never refresh a device library from the server, even if it is empty.
        const legacyRaw = storage?.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          const legacy = librarySchema.parse(JSON.parse(legacyRaw).library);
          this.migratedLegacy = legacyRaw;
          if (JSON.stringify(legacy) !== JSON.stringify(saved.library)) {
            // An open tab running the old app may have edited its old cache.
            this.pending = { library: legacy, sequence: ++this.sequence };
            this.publish({ library: legacy, ready: true, conflict: saved });
            this.journal();
            return;
          }
          this.removeLegacy();
        }
        this.publish({ library: saved.library, ready: true });
        return;
      }
      const raw = storage?.getItem(LEGACY_STORAGE_KEY);
      let library: Library;
      if (raw) {
        const candidate = JSON.parse(raw);
        library = librarySchema.parse(candidate.library);
        this.migratedLegacy = raw;
        if (candidate.dirty === false && this.options.bootstrap) {
          try {
            library = await this.options.bootstrap({
              library,
              revision: Math.max(0, Math.floor(Number(candidate.revision) || 0)),
            });
          } catch {
            /* The existing cache remains usable without the server. */
          }
        }
      } else {
        try {
          library = this.options.bootstrap ? await this.options.bootstrap() : seedLibrary();
        } catch {
          library = seedLibrary();
        }
      }
      if (this.disposed) return;
      this.pending = { library: validateDeviceLibrary(library), sequence: ++this.sequence };
      this.publish({ library, ready: true });
      this.journal();
      await this.flush();
    } catch {
      // Preserve every stored value on failure instead of replacing it with an empty library.
      this.publish({
        ready: true,
        error:
          "Your device library could not be opened. Close other Bookit tabs and reload, or restore a backup. Existing stored data has been preserved.",
      });
    }
  }

  private journal() {
    if (!this.pending) return;
    try {
      this.options.storage?.setItem(
        this.journalKey,
        JSON.stringify({
          baseRevision: this.revision,
          updatedAt: Date.now(),
          sequence: this.pending.sequence,
          library: this.pending.library,
        }),
      );
      if (this.options.storage) this.journalSequence = this.pending.sequence;
    } catch {
      // IndexedDB is authoritative. A full localStorage journal does not prevent its save.
    }
  }

  private removeJournal() {
    try {
      this.options.storage?.removeItem(this.journalKey);
      for (const { key, sequence } of this.recoveredKeys) {
        const raw = this.options.storage?.getItem(key);
        if (raw && recoverySchema.parse(JSON.parse(raw)).sequence === sequence) {
          this.options.storage?.removeItem(key);
        }
      }
      this.recoveredKeys = [];
    } catch {
      /* A remaining recovery copy is harmless and is checked on reopening. */
    }
  }

  private removeLegacy() {
    if (!this.migratedLegacy) return;
    try {
      if (this.options.storage?.getItem(LEGACY_STORAGE_KEY) === this.migratedLegacy) {
        this.options.storage.removeItem(LEGACY_STORAGE_KEY);
      }
    } catch {
      /* Preserve the old copy if it cannot be removed safely. */
    }
    this.migratedLegacy = null;
  }

  update = (mutate: (library: Library) => Library) => {
    if (!this.state.ready) return;
    try {
      const library = validateDeviceLibrary(mutate(this.state.library));
      this.pending = { library, sequence: ++this.sequence };
      this.journal(); // Synchronous recovery protects edits if the app closes mid-transaction.
      this.publish({ library });
      void this.flush();
    } catch (error) {
      this.publish({
        error: error instanceof Error ? error.message : "This change could not be stored.",
      });
    }
  };

  flush(): Promise<void> {
    if (this.saving) return this.saving;
    this.saving = this.save().finally(() => {
      this.saving = null;
    });
    return this.saving;
  }

  private async save() {
    if (!this.database || this.state.conflict) return;
    while (this.pending && !this.state.conflict) {
      const draft = this.pending;
      try {
        const saved = await this.database.write(draft.library, this.revision, {
          key: this.journalKey,
          sequence: draft.sequence,
        });
        this.revision = saved.revision;
        this.removeLegacy();
        if (this.pending.sequence === draft.sequence) {
          this.pending = null;
          this.removeJournal();
        } else this.journal();
        this.publish({ error: "" });
        if (!this.disposed) this.options.committed?.();
      } catch (error) {
        if (error instanceof DeviceConflict) this.publish({ conflict: error.snapshot });
        else
          this.publish({
            error:
              "Your changes could not be saved to device storage. Keep Bookit open and export a backup before closing it.",
          });
        return;
      }
    }
  }

  refresh = async () => {
    if (!this.database || this.pending || this.state.conflict || this.disposed) return;
    const sequence = this.sequence;
    try {
      const saved = await this.database.read();
      if (saved && sequence === this.sequence && !this.pending && !this.disposed) {
        this.revision = saved.revision;
        this.publish({ library: saved.library });
      }
    } catch {
      /* Keep the open library; a later write reports any storage failure. */
    }
  };

  resolveConflict = async (choice: "device" | "saved") => {
    if (!this.database || !this.state.conflict) return;
    try {
      if (choice === "saved") {
        const saved = await this.database.read();
        if (!saved) throw new Error("The stored library is missing.");
        this.revision = saved.revision;
        this.pending = null;
        this.removeJournal();
        this.removeLegacy();
        this.publish({ library: saved.library, conflict: null, error: "" });
      } else {
        // The UI exported this exact stored version. A newer write must raise
        // another conflict instead of overwriting a version without its backup.
        this.revision = this.state.conflict.revision;
        this.publish({ conflict: null });
        this.journal();
        await this.flush();
      }
    } catch {
      this.publish({
        error: "The library could not be reopened. Keep this tab open and export a backup.",
      });
    }
  };

  clearError = () => this.publish({ error: "" });
  dispose() {
    this.disposed = true;
    this.listeners.clear();
    void Promise.allSettled([this.initialization, this.saving]).then(() => this.database?.close());
  }
}
