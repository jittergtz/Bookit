import test from "node:test";
import assert from "node:assert/strict";
import { IDBFactory } from "fake-indexeddb";
import { openDeviceDatabase } from "../src/lib/device-database";
import { createLibraryBackup, parseLibraryBackup } from "../src/lib/library-backup";
import {
  applyBookPaperDefaults,
  newDesignElement,
  newPage,
  paperStyle,
  resetPagePaper,
  setPageLayout,
  usesBookPaper,
} from "../src/lib/model";
import { seedLibrary } from "../src/lib/seed";

test("changing book defaults updates 80 base pages and preserves custom paper and content", () => {
  const original = seedLibrary().books[0];
  original.paperColor = "#e8eef4";
  original.paperPattern = "lined";
  original.pages = Array.from({ length: 80 }, (_, index) => ({
    ...newPage(original),
    content: `Thought ${index + 1}`,
  }));
  const custom = {
    ...newPage(original),
    paperColor: "#ffffff",
    paperPattern: "blank" as const,
    paperCustomized: true,
    elements: [newDesignElement({ kind: "sticker", text: "🌿" })],
  };
  // Even choosing the same current paper explicitly must remain a custom choice.
  const sameColorCustom = { ...newPage(original), paperCustomized: true };
  original.pages.push(custom, sameColorCustom);
  const before = structuredClone(original);
  const updated = applyBookPaperDefaults(
    {
      ...original,
      paperColor: "#303238",
      paperPattern: "grid",
      updatedAt: "2026-10-12T12:00:00.000Z",
    },
    original,
  );
  for (const [index, page] of updated.pages.slice(0, 80).entries()) {
    assert.equal(page.paperColor, "#303238");
    assert.equal(page.paperPattern, "grid");
    assert.equal(page.content, before.pages[index].content);
    assert.equal(page.id, before.pages[index].id);
    assert.equal(page.createdAt, before.pages[index].createdAt);
    assert.equal(page.updatedAt, updated.updatedAt);
    assert.equal(usesBookPaper(page, updated), true);
  }
  assert.deepEqual(updated.pages[80], custom);
  assert.deepEqual(updated.pages[81], sameColorCustom);
  assert.deepEqual(original, before, "saving defaults does not mutate the original book");
  const next = newPage(updated);
  assert.equal(next.paperColor, "#303238");
  assert.equal(next.paperPattern, "grid");
  assert.equal(next.paperCustomized, false);
});

test("legacy matching pages inherit; custom pages stay custom across later changes and resets", () => {
  const original = seedLibrary().books[0];
  const inherited = newPage(original);
  delete inherited.paperCustomized;
  inherited.paperColor = original.paperColor.toUpperCase();
  const custom = { ...newPage(original), paperColor: "#123456" };
  delete custom.paperCustomized;
  original.pages = [inherited, custom];
  const updated = applyBookPaperDefaults({ ...original, paperColor: "#123456" }, original);
  assert.equal(updated.pages[0].paperCustomized, false);
  assert.equal(updated.pages[1].paperCustomized, true);
  const second = applyBookPaperDefaults({ ...updated, paperColor: "#ffffff" }, updated);
  assert.equal(second.pages[0].paperColor, "#ffffff");
  assert.equal(second.pages[1].paperColor, "#123456");
  second.pages[1] = resetPagePaper(second.pages[1], second);
  const third = applyBookPaperDefaults(
    { ...second, paperColor: "#303238", paperPattern: "dotted" },
    second,
  );
  assert.ok(
    third.pages.every((page) => page.paperColor === "#303238" && page.paperPattern === "dotted"),
  );
  assert.equal(third.pages[1].content, custom.content);
});

test("paper inheritance survives device reopening and backup restoration", async () => {
  const factory = new IDBFactory();
  const library = seedLibrary();
  const original = library.books[0];
  original.pages = [newPage(original), { ...newPage(original), paperCustomized: true }];
  library.books[0] = applyBookPaperDefaults({ ...original, paperColor: "#303238" }, original);
  const db = await openDeviceDatabase(factory);
  const saved = await db.write(library, 0);
  db.close();
  const reopened = await openDeviceDatabase(factory);
  try {
    const stored = await reopened.read();
    assert.deepEqual(stored, saved);
    const restored = parseLibraryBackup(createLibraryBackup(stored!.library));
    const book = restored.books[0];
    const changed = applyBookPaperDefaults(
      { ...book, paperColor: "#ffffff", paperPattern: "blank" },
      book,
    );
    assert.equal(changed.pages[0].paperPattern, "blank");
    assert.deepEqual(changed.pages[1], original.pages[1]);
  } finally {
    reopened.close();
  }
});

test("dark and light paper use readable ink and newly composed writing matches", () => {
  assert.equal(paperStyle("#303238").color, "#fafafa");
  assert.equal(paperStyle("#ffffff").color, "#171717");
  const book = seedLibrary().books[0];
  const page = {
    ...newPage({ ...book, paperColor: "#303238" }),
    title: "Night",
    content: "A thought",
  };
  const composed = setPageLayout(page, "canvas");
  assert.ok(composed.elements!.every((element) => element.color === "#fafafa"));
});
