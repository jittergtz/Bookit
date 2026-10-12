import { librarySchema, syncSchema, type Library, type Snapshot } from "./model";

export const DEVICE_DATABASE = "bookit-device-v1";

export class DeviceConflict extends Error {
  constructor(public snapshot: Snapshot) {
    super("The library changed in another tab.");
  }
}

export interface DeviceDatabase {
  read(): Promise<Snapshot | null>;
  write(
    library: Library,
    expectedRevision: number,
    journal?: { key: string; sequence: number },
  ): Promise<Snapshot>;
  committedRecovery(key: string, sequence: number): Promise<boolean>;
  close(): void;
}

export function validateDeviceLibrary(value: Library): Library {
  const library = librarySchema.parse(value);
  if (new TextEncoder().encode(JSON.stringify(library)).byteLength > 5_000_000) {
    throw new Error("Your library exceeds 5 MB. Export a backup or remove unused artwork first.");
  }
  return library;
}

export function openDeviceDatabase(
  factory: IDBFactory = indexedDB,
  name = DEVICE_DATABASE,
): Promise<DeviceDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore("library");
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Close other Bookit tabs and reopen the app to finish updating storage."));
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();

      function transaction(write: boolean) {
        if (!write) return db.transaction("library", "readonly");
        try {
          return db.transaction("library", "readwrite", { durability: "strict" });
        } catch (error) {
          // Older browsers support transactions but not the durability option.
          if (!(error instanceof TypeError)) throw error;
          return db.transaction("library", "readwrite");
        }
      }

      resolve({
        read: () =>
          new Promise((done, fail) => {
            const tx = transaction(false);
            let snapshot: Snapshot | null = null;
            let failure: unknown;
            const read = tx.objectStore("library").get("current");
            read.onsuccess = () => {
              try {
                snapshot = read.result === undefined ? null : syncSchema.parse(read.result);
              } catch (error) {
                failure = error;
                tx.abort();
              }
            };
            tx.oncomplete = () => done(snapshot);
            tx.onabort = () => fail(failure || tx.error || new Error("Device read failed."));
            tx.onerror = () => fail(tx.error);
          }),
        committedRecovery: (key, sequence) =>
          new Promise((done, fail) => {
            const tx = transaction(false);
            const read = tx.objectStore("library").get(`writer:${key}`);
            tx.oncomplete = () => done(Number(read.result ?? -1) >= sequence);
            tx.onabort = () => fail(tx.error);
            tx.onerror = () => fail(tx.error);
          }),
        write: (value, expectedRevision, journal) => {
          const library = validateDeviceLibrary(value);
          return new Promise((done, fail) => {
            const tx = transaction(true);
            const store = tx.objectStore("library");
            let snapshot: Snapshot;
            let failure: unknown;
            const read = store.get("current");
            read.onsuccess = () => {
              try {
                const previous = read.result === undefined ? null : syncSchema.parse(read.result);
                if ((previous?.revision ?? 0) !== expectedRevision) {
                  if (!previous) throw new Error("The stored library is missing.");
                  throw new DeviceConflict(previous);
                }
                snapshot = { revision: expectedRevision + 1, library };
                store.put(snapshot, "current");
                if (journal) store.put(journal.sequence, `writer:${journal.key}`);
              } catch (error) {
                failure = error;
                tx.abort();
              }
            };
            // A successful put request alone does not mean the transaction committed.
            tx.oncomplete = () => done(snapshot);
            tx.onabort = () => fail(failure || tx.error || new Error("Device save failed."));
            tx.onerror = () => fail(tx.error);
          });
        },
        close: () => db.close(),
      });
    };
  });
}
