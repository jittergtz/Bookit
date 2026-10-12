import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, RevisionConflict } from "../src/lib/database";
import { librarySchema } from "../src/lib/model";

test("books, pages, and customization survive closing and reopening SQLite", () => {
  const dir = mkdtempSync(join(tmpdir(), "bookit-test-"));
  const path = join(dir, "library.sqlite");
  const db = openDatabase(path);
  try {
    const initial = db.read();
    const book = initial.library.books[0];
    book.title = "A personal year";
    book.coverColor = "#75637c";
    book.pages[0].content =
      "Something worth keeping — with ‘quotes’ and SQL-like text: DROP TABLE books;";
    book.pages[0].paperPattern = "grid";
    const saved = db.write(initial.library, initial.revision);
    db.close();
    const reopened = openDatabase(path);
    try {
      assert.deepEqual(reopened.read(), saved);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("stale writes are rejected without discarding either version", () => {
  const db = openDatabase(":memory:");
  try {
    const first = db.read();
    const stale = structuredClone(first);
    first.library.books[0].title = "Server version";
    const saved = db.write(first.library, first.revision);
    stale.library.books[0].title = "Offline device version";
    assert.throws(
      () => db.write(stale.library, stale.revision),
      (error) => error instanceof RevisionConflict && error.snapshot.revision === saved.revision,
    );
    assert.equal(db.read().library.books[0].title, "Server version");
    assert.equal(stale.library.books[0].title, "Offline device version");
  } finally {
    db.close();
  }
});

test("deleting collections preserves their books and deleting books removes pages", () => {
  const db = openDatabase(":memory:");
  try {
    const snapshot = db.read();
    const removedId = snapshot.library.collections[0].id;
    snapshot.library.collections = snapshot.library.collections.filter((c) => c.id !== removedId);
    snapshot.library.books = snapshot.library.books.map((b) =>
      b.collectionId === removedId ? { ...b, collectionId: null } : b,
    );
    const saved = db.write(snapshot.library, snapshot.revision);
    assert.equal(saved.library.books.length, 4);
    const removedBook = saved.library.books[0];
    saved.library.books = saved.library.books.filter((b) => b.id !== removedBook.id);
    const final = db.write(saved.library, saved.revision);
    assert.equal(final.library.books.length, 3);
    assert.equal(
      final.library.books
        .flatMap((b) => b.pages)
        .some((p) => removedBook.pages.some((old) => old.id === p.id)),
      false,
    );
  } finally {
    db.close();
  }
});

test("invalid or duplicate IDs and nonexistent collections cannot corrupt a library", () => {
  const db = openDatabase(":memory:");
  try {
    const initial = db.read();
    const invalid = structuredClone(initial.library);
    invalid.books[0].collectionId = "missing-collection";
    assert.equal(librarySchema.safeParse(invalid).success, false);
    assert.throws(() => db.write(invalid, initial.revision));
    assert.deepEqual(db.read(), initial);
    invalid.books[0].collectionId = null;
    invalid.books[1].pages[0].id = invalid.books[0].pages[0].id;
    assert.equal(librarySchema.safeParse(invalid).success, false);
    invalid.books[1].pages[0].id = "unique-page";
    invalid.books[0].pages = [];
    assert.equal(librarySchema.safeParse(invalid).success, false);
  } finally {
    db.close();
  }
});
