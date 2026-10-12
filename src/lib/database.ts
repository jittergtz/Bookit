import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { librarySchema, type Library, type Snapshot } from "./model";
import { seedLibrary } from "./seed";

export class RevisionConflict extends Error {
  constructor(public snapshot: Snapshot) {
    super("Your library was updated on another device.");
  }
}

export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value INTEGER NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, position INTEGER NOT NULL, name TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY, position INTEGER NOT NULL, collection_id TEXT REFERENCES collections(id) ON DELETE SET NULL,
      properties TEXT NOT NULL CHECK(json_valid(properties))
    ) STRICT;
    CREATE TABLE IF NOT EXISTS pages (
      id TEXT PRIMARY KEY, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      position INTEGER NOT NULL, properties TEXT NOT NULL CHECK(json_valid(properties))
    ) STRICT;
    CREATE INDEX IF NOT EXISTS pages_book_idx ON pages(book_id, position);
  `);

  function read(): Snapshot {
    const collections = db.prepare("SELECT id, name FROM collections ORDER BY position").all();
    const pageRows = db.prepare("SELECT book_id, properties FROM pages ORDER BY position").all();
    const books = db
      .prepare("SELECT id, collection_id, properties FROM books ORDER BY position")
      .all()
      .map((row) => ({
        ...JSON.parse(String(row.properties)),
        id: row.id,
        collectionId: row.collection_id,
        pages: pageRows
          .filter((page) => page.book_id === row.id)
          .map((page) => JSON.parse(String(page.properties))),
      }));
    const revision = Number(
      db.prepare("SELECT value FROM metadata WHERE key = 'revision'").get()?.value ?? 0,
    );
    return { revision, library: librarySchema.parse({ collections, books }) };
  }

  function write(library: Library, expectedRevision: number): Snapshot {
    const validated = librarySchema.parse(library);
    db.exec("BEGIN IMMEDIATE");
    try {
      const current = Number(
        db.prepare("SELECT value FROM metadata WHERE key = 'revision'").get()?.value ?? 0,
      );
      if (current !== expectedRevision) throw new RevisionConflict(read());
      db.exec("DELETE FROM pages; DELETE FROM books; DELETE FROM collections;");
      const insertCollection = db.prepare(
        "INSERT INTO collections (id, position, name) VALUES (?, ?, ?)",
      );
      validated.collections.forEach((collection, index) =>
        insertCollection.run(collection.id, index, collection.name),
      );
      const insertBook = db.prepare(
        "INSERT INTO books (id, position, collection_id, properties) VALUES (?, ?, ?, ?)",
      );
      const insertPage = db.prepare(
        "INSERT INTO pages (id, book_id, position, properties) VALUES (?, ?, ?, ?)",
      );
      validated.books.forEach((book, index) => {
        const { pages, collectionId, ...properties } = book;
        insertBook.run(book.id, index, collectionId, JSON.stringify(properties));
        pages.forEach((page, pageIndex) =>
          insertPage.run(page.id, book.id, pageIndex, JSON.stringify(page)),
        );
      });
      db.prepare(
        "INSERT INTO metadata (key, value) VALUES ('revision', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(current + 1);
      db.exec("COMMIT");
      return { revision: current + 1, library: validated };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  if (!db.prepare("SELECT value FROM metadata WHERE key = 'revision'").get()) {
    try {
      write(seedLibrary(), 0);
    } catch (error) {
      if (!(error instanceof RevisionConflict)) throw error;
    }
  }
  return { read, write, close: () => db.close() };
}

const globalDatabase = globalThis as typeof globalThis & {
  bookitDatabase?: ReturnType<typeof openDatabase>;
};
export function getDatabase() {
  return (globalDatabase.bookitDatabase ??= openDatabase(
    process.env.BOOKIT_DB_PATH || resolve(process.cwd(), "data/bookit.sqlite"),
  ));
}
