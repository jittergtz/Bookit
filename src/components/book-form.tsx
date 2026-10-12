"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import {
  coverColors,
  newId,
  newPage,
  paperColors,
  paperPatterns,
  type Book,
  type Collection,
} from "@/lib/model";
import { BookCover, Sheet } from "./ui";

export function BookForm({
  book,
  collections,
  onSave,
  onClose,
}: {
  book?: Book;
  collections: Collection[];
  onSave: (book: Book, newCollection?: Collection) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Book>(
    () =>
      book || {
        id: newId(),
        title: "",
        subtitle: "",
        coverColor: "#68755a",
        coverStyle: "frame",
        font: "serif",
        paperColor: "#faf7ee",
        paperPattern: "lined",
        collectionId: null,
        favorite: false,
        pages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
  );
  const [tab, setTab] = useState<"cover" | "paper">("cover");
  const [addingCollection, setAddingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const set = <K extends keyof Book>(key: K, value: Book[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) return;
    const existing = collections.find(
      (c) => c.name.toLowerCase() === collectionName.trim().toLowerCase(),
    );
    const collection =
      addingCollection && collectionName.trim()
        ? existing || { id: newId(), name: collectionName.trim() }
        : undefined;
    onSave(
      {
        ...draft,
        title: draft.title.trim(),
        collectionId: collection?.id || draft.collectionId,
        pages: draft.pages.length ? draft.pages : [newPage(draft)],
        updatedAt: new Date().toISOString(),
      },
      existing ? undefined : collection,
    );
  };

  return (
    <Sheet
      title={book ? "Make it yours" : "A new chapter"}
      eyebrow={book ? "CUSTOMIZE YOUR BOOK" : "CREATE A BOOK"}
      onClose={onClose}
    >
      <form onSubmit={save} className="book-form">
        <div className="book-preview">
          <BookCover
            book={{
              ...draft,
              title: draft.title || "Your story",
              subtitle: draft.subtitle || "Waiting to be written",
            }}
            size="preview"
          />
          <span>A little preview of your next favorite book.</span>
        </div>
        <label className="field-label">
          Book title
          <input
            autoComplete="off"
            placeholder="e.g. Life lessons"
            maxLength={80}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            required
          />
        </label>
        <label className="field-label">
          A few words underneath <span className="optional">optional</span>
          <input
            placeholder="e.g. Things I’m learning along the way"
            maxLength={120}
            value={draft.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
          />
        </label>
        <div className="segmented">
          <button
            type="button"
            className={tab === "cover" ? "active" : ""}
            onClick={() => setTab("cover")}
          >
            The cover
          </button>
          <button
            type="button"
            className={tab === "paper" ? "active" : ""}
            onClick={() => setTab("paper")}
          >
            The paper
          </button>
        </div>
        {tab === "cover" ? (
          <>
            <fieldset>
              <legend>Cover color</legend>
              <div className="color-options">
                {coverColors.map((color, index) => (
                  <button
                    type="button"
                    key={color}
                    style={{ background: color }}
                    className={`color-swatch ${draft.coverColor === color ? "selected" : ""}`}
                    aria-label={
                      [
                        "Sage",
                        "Terracotta",
                        "Slate",
                        "Honey",
                        "Plum",
                        "Charcoal",
                        "Rose",
                        "Sea glass",
                      ][index]
                    }
                    aria-pressed={draft.coverColor === color}
                    onClick={() => set("coverColor", color)}
                  >
                    {draft.coverColor === color && <Check size={17} />}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Title typeface</legend>
              <div className="choice-row">
                {(["serif", "sans"] as const).map((font) => (
                  <button
                    type="button"
                    className={`type-choice font-${font} ${draft.font === font ? "selected" : ""}`}
                    key={font}
                    onClick={() => set("font", font)}
                    aria-pressed={draft.font === font}
                  >
                    <span>Aa</span>
                    {font === "serif" ? "Classic serif" : "Modern sans"}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend>Cover style</legend>
              <div className="choice-row">
                {(["classic", "minimal", "frame"] as const).map((style) => (
                  <button
                    type="button"
                    key={style}
                    className={`choice ${draft.coverStyle === style ? "selected" : ""}`}
                    onClick={() => set("coverStyle", style)}
                    aria-pressed={draft.coverStyle === style}
                  >
                    {style === "frame" ? "Framed" : style === "classic" ? "Classic" : "Minimal"}
                  </button>
                ))}
              </div>
            </fieldset>
          </>
        ) : (
          <PaperOptions
            color={draft.paperColor}
            pattern={draft.paperPattern}
            onColor={(color) => set("paperColor", color)}
            onPattern={(pattern) => set("paperPattern", pattern)}
          />
        )}
        <fieldset>
          <legend>Keep it in a collection</legend>
          <div className="collection-select">
            <select
              aria-label="Collection"
              value={addingCollection ? "new" : draft.collectionId || ""}
              onChange={(e) => {
                setAddingCollection(e.target.value === "new");
                if (e.target.value !== "new") set("collectionId", e.target.value || null);
              }}
            >
              <option value="">No collection</option>
              {collections.map((collection) => (
                <option value={collection.id} key={collection.id}>
                  {collection.name}
                </option>
              ))}
              <option value="new">+ New collection</option>
            </select>
          </div>
          {addingCollection && (
            <input
              aria-label="New collection name"
              placeholder="Name your collection"
              maxLength={40}
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              required
            />
          )}
        </fieldset>
        {book && (
          <p className="small-note">
            Paper choices become the default for new pages. Existing pages keep their own style.
          </p>
        )}
        <div className="sheet-footer">
          <button className="primary-button" type="submit">
            {book ? <Check size={18} /> : <Plus size={18} />}
            {book ? "Save changes" : "Create my book"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function PaperOptions({
  color,
  pattern,
  onColor,
  onPattern,
}: {
  color: Book["paperColor"];
  pattern: Book["paperPattern"];
  onColor: (color: Book["paperColor"]) => void;
  onPattern: (pattern: Book["paperPattern"]) => void;
}) {
  return (
    <>
      <fieldset>
        <legend>Paper color</legend>
        <div className="color-options paper-colors">
          {paperColors.map((value, index) => (
            <button
              type="button"
              key={value}
              className={`color-swatch ${color === value ? "selected" : ""}`}
              style={{ background: value }}
              aria-label={
                ["Warm ivory paper", "White paper", "Sage paper", "Blush paper", "Blue paper"][
                  index
                ]
              }
              aria-pressed={color === value}
              onClick={() => onColor(value)}
            >
              {color === value && <Check size={17} />}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Room for your thoughts</legend>
        <div className="paper-options">
          {paperPatterns.map((value) => (
            <button
              type="button"
              key={value}
              className={`paper-option ${pattern === value ? "selected" : ""}`}
              aria-pressed={pattern === value}
              onClick={() => onPattern(value)}
            >
              <span className={`paper-sample paper-${value}`} style={{ backgroundColor: color }} />
              <span>
                {value === "lined"
                  ? "Lines"
                  : value === "grid"
                    ? "Grid"
                    : value === "dotted"
                      ? "Dots"
                      : "Blank"}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
    </>
  );
}
