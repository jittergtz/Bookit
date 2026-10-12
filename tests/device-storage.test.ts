import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import {
  openDeviceDatabase,
  DeviceConflict,
  validateDeviceLibrary,
  type DeviceDatabase,
} from "../src/lib/device-database";
import {
  DeviceLibrarySession,
  LEGACY_STORAGE_KEY,
  RECOVERY_PREFIX,
} from "../src/lib/device-library";
import { getCoverDesign, newDesignElement, newPage, type Library } from "../src/lib/model";
import { seedLibrary } from "../src/lib/seed";

class MemoryStorage implements Storage {
  data = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.data.size;
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("Full", "QuotaExceededError");
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
  }
}

function session(
  factory: IDBFactory,
  storage = new MemoryStorage(),
  bootstrap?: () => Promise<Library>,
) {
  return new DeviceLibrarySession({ open: () => openDeviceDatabase(factory), storage, bootstrap });
}
function changeTitle(value: string) {
  return (library: Library): Library => ({
    ...library,
    books: library.books.map((book, index) => (index ? book : { ...book, title: value })),
  });
}

// The test helper implements IndexedDB transactions rather than stubbing the storage API.
test("device data survives closing and reopening the transactional database", async () => {
  const factory = new IDBFactory();
  const db = await openDeviceDatabase(factory);
  const library = seedLibrary();
  library.books[0].favorite = true;
  library.books[0].coverColor = "#123456";
  library.books[0].pages[0].content = "Offline writing, quotes ‘ ’, and emoji 🌿.";
  library.books[0].pages[0].paperPattern = "grid";
  library.books[0].coverDesign = getCoverDesign(library.books[0]);
  const photo = newDesignElement({
    kind: "image",
    image:
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/dv0AAAAASUVORK5CYII=",
  });
  library.books[0].coverDesign.elements.push(photo);
  library.books[0].pages[0].elements = [photo, newDesignElement({ kind: "sticker", text: "🌿" })];
  library.books[0].pages.push(newPage(library.books[0]));
  const snapshot = await db.write(library, 0);
  db.close();
  const reopened = await openDeviceDatabase(factory);
  assert.deepEqual(await reopened.read(), snapshot);
  reopened.close();
});

test("first use with no server creates a working library and all edits reopen offline", async () => {
  const factory = new IDBFactory();
  const storage = new MemoryStorage();
  const app = session(factory, storage, async () => {
    throw new TypeError("offline");
  });
  await app.initialize();
  assert.equal(app.getState().ready, true);
  assert.equal(app.getState().library.books.length, 4);
  app.update(changeTitle("Made entirely on this device"));
  await app.flush();
  assert.equal(app.getState().error, "");
  app.dispose();
  const reopened = session(factory, storage, async () => {
    throw new Error("Must not request the server again");
  });
  await reopened.initialize();
  assert.equal(reopened.getState().library.books[0].title, "Made entirely on this device");
  assert.equal(reopened.getState().error, "");
  reopened.dispose();
});

test("legacy drafts migrate without fetching or replacing unsent writing", async () => {
  const factory = new IDBFactory();
  const storage = new MemoryStorage();
  const library = seedLibrary();
  library.books[0].pages[0].content = "My unsent device draft";
  storage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({ library, revision: 99, dirty: true, generation: 50 }),
  );
  let fetched = false;
  const app = session(factory, storage, async () => {
    fetched = true;
    return seedLibrary();
  });
  await app.initialize();
  assert.equal(fetched, false);
  assert.deepEqual(app.getState().library, library);
  const db = await openDeviceDatabase(factory);
  assert.deepEqual((await db.read())?.library, library);
  assert.equal(
    storage.getItem(LEGACY_STORAGE_KEY),
    null,
    "Only remove the old copy after a committed migration",
  );
  app.dispose();
  db.close();
});

test("a device library, including an intentionally empty one, never refreshes from SQLite", async () => {
  const factory = new IDBFactory();
  const db = await openDeviceDatabase(factory);
  await db.write({ books: [], collections: [] }, 0);
  let fetched = false;
  const app = session(factory, new MemoryStorage(), async () => {
    fetched = true;
    return seedLibrary();
  });
  await app.initialize();
  assert.equal(fetched, false);
  assert.deepEqual(app.getState().library, { books: [], collections: [] });
  app.dispose();
  db.close();
});

test("rapid edits made during a transaction all reach device storage", async () => {
  const factory = new IDBFactory();
  const app = session(factory);
  await app.initialize();
  for (let index = 0; index < 25; index++) app.update(changeTitle(`Edit ${index}`));
  await app.flush();
  const db = await openDeviceDatabase(factory);
  assert.equal((await db.read())?.library.books[0].title, "Edit 24");
  assert.equal(app.getState().error, "");
  app.dispose();
  db.close();
});

test("a full localStorage journal does not prevent a committed IndexedDB save", async () => {
  const factory = new IDBFactory();
  const storage = new MemoryStorage();
  storage.failWrites = true;
  const app = session(factory, storage);
  await app.initialize();
  app.update(changeTitle("IndexedDB has room"));
  assert.equal(app.hasUnprotectedEdits(), true);
  await app.flush();
  assert.equal(app.hasUnprotectedEdits(), false);
  assert.equal(app.getState().error, "");
  const db = await openDeviceDatabase(factory);
  assert.equal((await db.read())?.library.books[0].title, "IndexedDB has room");
  db.close();
  app.dispose();
});

test("failed transactions keep an immediate recovery copy and recover it on reopening", async () => {
  const factory = new IDBFactory();
  const storage = new MemoryStorage();
  const actual = await openDeviceDatabase(factory);
  let fail = false;
  const unreliable: DeviceDatabase = {
    ...actual,
    write: (...args) =>
      fail ? Promise.reject(new DOMException("Full", "QuotaExceededError")) : actual.write(...args),
  };
  const app = new DeviceLibrarySession({ open: async () => unreliable, storage });
  await app.initialize();
  fail = true;
  app.update(changeTitle("Recover my final edit"));
  assert.equal(
    [...storage.data.keys()].some((key) => key.startsWith(RECOVERY_PREFIX)),
    true,
  );
  await app.flush();
  assert.match(app.getState().error, /could not be saved/);
  assert.notEqual((await actual.read())?.library.books[0].title, "Recover my final edit");
  app.dispose();
  const reopened = session(factory, storage);
  await reopened.initialize();
  assert.equal(reopened.getState().library.books[0].title, "Recover my final edit");
  assert.equal(reopened.getState().error, "");
  const db = await openDeviceDatabase(factory);
  assert.equal((await db.read())?.library.books[0].title, "Recover my final edit");
  db.close();
  reopened.dispose();
});

test("unremoved journals from successful older commits cannot resurrect old content", async () => {
  const factory = new IDBFactory();
  const storage = new MemoryStorage();
  const first = seedLibrary();
  first.books[0].title = "Old committed content";
  const db = await openDeviceDatabase(factory);
  const key = `${RECOVERY_PREFIX}crashed-after-commit`;
  await db.write(first, 0, { key, sequence: 1 });
  storage.setItem(
    key,
    JSON.stringify({ library: first, baseRevision: 0, updatedAt: Date.now(), sequence: 1 }),
  );
  const latest = changeTitle("Newer committed content")(first);
  await db.write(latest, 1);
  const app = session(factory, storage);
  await app.initialize();
  assert.equal(app.getState().library.books[0].title, "Newer committed content");
  assert.equal(app.getState().conflict, null);
  app.dispose();
  db.close();
});

test("stale tabs cannot overwrite newer edits, even during conflict resolution", async () => {
  const factory = new IDBFactory();
  const storage = new MemoryStorage();
  const first = session(factory, storage);
  await first.initialize();
  const second = session(factory, storage);
  await second.initialize();
  first.update(changeTitle("First tab"));
  await first.flush();
  second.update(changeTitle("Second tab"));
  await second.flush();
  assert.equal(second.getState().conflict?.library.books[0].title, "First tab");
  first.update(changeTitle("An even newer edit"));
  await first.flush();
  await second.resolveConflict("device");
  assert.equal(second.getState().conflict?.library.books[0].title, "An even newer edit");
  const db = await openDeviceDatabase(factory);
  assert.equal((await db.read())?.library.books[0].title, "An even newer edit");
  await second.resolveConflict("saved");
  assert.equal(second.getState().library.books[0].title, "An even newer edit");
  first.dispose();
  second.dispose();
  db.close();
});

test("transaction abort after a successful put is not acknowledged as a save", async () => {
  const factory = new IDBFactory();
  const db = await openDeviceDatabase(factory);
  const first = await db.write(seedLibrary(), 0);
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value: unknown, key?: IDBValidKey) {
    const request = original.call(this, value, key);
    if (key === "current") request.addEventListener("success", () => this.transaction.abort());
    return request;
  };
  try {
    await assert.rejects(db.write(changeTitle("Must roll back")(first.library), first.revision));
  } finally {
    IDBObjectStore.prototype.put = original;
  }
  assert.deepEqual(await db.read(), first);
  db.close();
});

test("corrupt legacy data is preserved and never silently replaced with starter books", async () => {
  const storage = new MemoryStorage();
  storage.setItem(LEGACY_STORAGE_KEY, "{unreadable");
  const factory = new IDBFactory();
  let fetched = false;
  const app = session(factory, storage, async () => {
    fetched = true;
    return seedLibrary();
  });
  await app.initialize();
  assert.equal(fetched, false);
  assert.match(app.getState().error, /could not be opened/);
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), "{unreadable");
  const db = await openDeviceDatabase(factory);
  assert.equal(await db.read(), null);
  db.close();
  app.dispose();
});

test("UTF-8 storage limits reject multibyte libraries before changing durable data", async () => {
  const library = seedLibrary();
  library.books[0].pages = Array.from({ length: 30 }, () => ({
    ...newPage(library.books[0]),
    content: "é".repeat(100000),
  }));
  assert.ok(JSON.stringify(library).length < 5_000_000);
  assert.throws(() => validateDeviceLibrary(library), /exceeds 5 MB/);
  const db = await openDeviceDatabase(new IDBFactory());
  const initial = await db.write(seedLibrary(), 0);
  assert.throws(() => db.write(library, initial.revision), /exceeds 5 MB/);
  assert.deepEqual(await db.read(), initial);
  await assert.rejects(db.write(initial.library, 0), DeviceConflict);
  db.close();
});

test("edits from an old app tab are kept and offered for recovery after migration", async () => {
  const factory = new IDBFactory();
  const db = await openDeviceDatabase(factory);
  const saved = await db.write(seedLibrary(), 0);
  const legacy = changeTitle("Edited in the older app")(saved.library);
  const storage = new MemoryStorage();
  storage.setItem(
    LEGACY_STORAGE_KEY,
    JSON.stringify({ library: legacy, revision: 50, dirty: true }),
  );
  const app = session(factory, storage);
  await app.initialize();
  assert.equal(app.getState().library.books[0].title, "Edited in the older app");
  assert.deepEqual(app.getState().conflict, saved);
  assert.deepEqual(await db.read(), saved);
  await app.resolveConflict("device");
  assert.equal((await db.read())?.library.books[0].title, "Edited in the older app");
  assert.equal(storage.getItem(LEGACY_STORAGE_KEY), null);
  app.dispose();
  db.close();
});

test("backups preserve the full library and older indented backup formats", async () => {
  const { createLibraryBackup, parseLibraryBackup } = await import("../src/lib/library-backup");
  const library = seedLibrary();
  library.books[0].pages[0].content = "Complete backup 🌿";
  assert.deepEqual(parseLibraryBackup(createLibraryBackup(library)), library);
  assert.deepEqual(parseLibraryBackup(JSON.stringify({ version: 1, library }, null, 2)), library);
  assert.deepEqual(parseLibraryBackup(JSON.stringify(library)), library);
  assert.throws(() =>
    parseLibraryBackup('{"library":{"books":[],"collections":[{"id":"x","name":""}]}}'),
  );
});

test("clean legacy caches import newer SQLite data once but remain usable without a server", async () => {
  for (const offline of [false, true]) {
    const factory = new IDBFactory();
    const storage = new MemoryStorage();
    const cached = seedLibrary();
    cached.books[0].title = "Clean cached version";
    const newer = changeTitle("Newer SQLite version")(cached);
    storage.setItem(
      LEGACY_STORAGE_KEY,
      JSON.stringify({ library: cached, revision: 5, dirty: false }),
    );
    let calls = 0;
    const app = new DeviceLibrarySession({
      open: () => openDeviceDatabase(factory),
      storage,
      bootstrap: async (legacy) => {
        assert.equal(legacy?.revision, 5);
        calls++;
        if (offline) throw new TypeError("Server unavailable");
        return newer;
      },
    });
    await app.initialize();
    assert.equal(calls, 1);
    assert.deepEqual(app.getState().library, offline ? cached : newer);
    assert.equal(app.getState().error, "");
    app.dispose();
    const reopened = session(factory, storage, async () => {
      throw new Error("Unexpected server request");
    });
    await reopened.initialize();
    assert.deepEqual(reopened.getState().library, offline ? cached : newer);
    reopened.dispose();
  }
});
