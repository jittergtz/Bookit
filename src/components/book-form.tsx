"use client";

import { useState } from "react";
import { Check, Plus } from "lucide-react";
import {
  applyBookPaperDefaults,
  coverColors,
  coverPatterns,
  getCoverDesign,
  newDesignElement,
  newId,
  newPage,
  paperColors,
  paperPatterns,
  paperStyle,
  type Book,
  type Collection,
  type CoverDesign,
} from "@/lib/model";
import { CanvasEditor, ColorField } from "./design-canvas";
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
  const [draft, setDraft] = useState<Book>(() => {
    const initial: Book = book
      ? structuredClone(book)
      : {
          id: newId(),
          title: "",
          subtitle: "",
          coverColor: "#171717",
          coverStyle: "minimal",
          font: "serif",
          paperColor: "#ffffff",
          paperPattern: "lined",
          collectionId: null,
          favorite: false,
          pages: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
    return { ...initial, coverDesign: getCoverDesign(initial) };
  });
  const [tab, setTab] = useState<"cover" | "paper">("cover");
  const [addingCollection, setAddingCollection] = useState(false);
  const [collectionName, setCollectionName] = useState("");
  const design = draft.coverDesign!;
  const set = <K extends keyof Book>(key: K, value: Book[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));
  const changeDesign = (patch: Partial<CoverDesign>) =>
    setDraft((previous) => ({ ...previous, coverDesign: { ...previous.coverDesign!, ...patch } }));
  const preset = (kind: "blank" | "minimal" | "journal" | "playful") => {
    const title = newDesignElement({
      source: "title",
      color: "#ffffff",
      y: kind === "journal" ? 42 : 50,
      fontSize: 40,
      font: draft.font,
    });
    changeDesign({
      frame: kind === "journal" ? "single" : "none",
      texture: kind === "journal",
      pattern: "none",
      elements:
        kind === "blank"
          ? []
          : kind === "journal"
            ? [
                title,
                newDesignElement({
                  source: "subtitle",
                  color: "#ffffff",
                  y: 66,
                  fontSize: 14,
                  font: "sans",
                }),
              ]
            : kind === "playful"
              ? [
                  { ...title, y: 38, font: "sans", bold: true },
                  newDesignElement({
                    kind: "sticker",
                    text: "✿",
                    y: 70,
                    width: 30,
                    fontSize: 64,
                    color: "#ffffff",
                  }),
                ]
              : [title],
    });
  };
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
      applyBookPaperDefaults(
        {
          ...draft,
          title: draft.title.trim(),
          collectionId: collection?.id || draft.collectionId,
          pages: draft.pages.length ? draft.pages : [newPage(draft)],
          updatedAt: new Date().toISOString(),
        },
        book ?? draft,
      ),
      existing ? undefined : collection,
    );
  };
  return (
    <Sheet
      title={book ? "Edit your book" : "Create a book"}
      eyebrow="MAKE IT YOURS"
      onClose={onClose}
    >
      <form onSubmit={save} className="book-form">
        <label className="field-label">
          Book name
          <input
            autoComplete="off"
            placeholder="e.g. Life lessons"
            maxLength={80}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            required
          />
        </label>
        <p className="small-note">Your library name stays visible even with a blank cover.</p>
        <label className="field-label">
          Subtitle <span className="optional">optional</span>
          <input
            placeholder="A few words about this book"
            maxLength={120}
            value={draft.subtitle}
            onChange={(event) => set("subtitle", event.target.value)}
          />
        </label>
        <div className="segmented">
          <button
            type="button"
            className={tab === "cover" ? "active" : ""}
            onClick={() => setTab("cover")}
          >
            Cover studio
          </button>
          <button
            type="button"
            className={tab === "paper" ? "active" : ""}
            onClick={() => setTab("paper")}
          >
            Default paper
          </button>
        </div>
        {tab === "cover" ? (
          <>
            <div className="preset-row" aria-label="Cover starting points">
              <span>Start with</span>
              {(["blank", "minimal", "journal", "playful"] as const).map((kind) => (
                <button type="button" key={kind} onClick={() => preset(kind)}>
                  {kind === "blank" ? "Blank cover" : kind[0].toUpperCase() + kind.slice(1)}
                </button>
              ))}
            </div>
            <details className="studio-section">
              <summary>
                Background <span>Color, gradient & pattern</span>
              </summary>
              <div className="studio-settings">
                <div className="color-options">
                  {["#171717", "#ffffff", ...coverColors].map((color) => (
                    <button
                      type="button"
                      key={color}
                      style={{
                        background: color,
                        color: color === "#ffffff" ? "#171717" : "#ffffff",
                      }}
                      className={`color-swatch ${draft.coverColor === color ? "selected" : ""}`}
                      aria-label={`Cover color ${color}`}
                      aria-pressed={draft.coverColor === color}
                      onClick={() => set("coverColor", color)}
                    >
                      {draft.coverColor === color && <Check size={17} />}
                    </button>
                  ))}
                </div>
                <ColorField
                  label="Background color"
                  value={draft.coverColor}
                  onChange={(color) => set("coverColor", color)}
                />
                <div className="choice-row">
                  {(["solid", "linear", "radial"] as const).map((fill) => (
                    <button
                      type="button"
                      key={fill}
                      className={`choice ${design.fill === fill ? "selected" : ""}`}
                      aria-pressed={design.fill === fill}
                      onClick={() => changeDesign({ fill })}
                    >
                      {fill === "solid" ? "Solid" : fill === "linear" ? "Gradient" : "Radial"}
                    </button>
                  ))}
                </div>
                {design.fill !== "solid" && (
                  <ColorField
                    label="Gradient end color"
                    value={design.gradientColor}
                    onChange={(gradientColor) => changeDesign({ gradientColor })}
                  />
                )}
                {design.fill === "linear" && (
                  <label className="range-field">
                    <span>
                      Gradient angle <output>{design.gradientAngle}°</output>
                    </span>
                    <input
                      type="range"
                      aria-label="Gradient angle"
                      min={0}
                      max={360}
                      value={design.gradientAngle}
                      onChange={(event) =>
                        changeDesign({ gradientAngle: Number(event.target.value) })
                      }
                    />
                  </label>
                )}
                <label className="field-label">
                  Pattern
                  <select
                    aria-label="Cover pattern"
                    value={design.pattern}
                    onChange={(event) =>
                      changeDesign({ pattern: event.target.value as CoverDesign["pattern"] })
                    }
                  >
                    {coverPatterns.map((pattern) => (
                      <option key={pattern} value={pattern}>
                        {pattern[0].toUpperCase() + pattern.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <ColorField
                  label="Pattern & frame color"
                  value={design.patternColor}
                  onChange={(patternColor) => changeDesign({ patternColor })}
                />
                {design.pattern !== "none" && (
                  <label className="range-field">
                    <span>
                      Pattern strength <output>{Math.round(design.patternOpacity * 100)}%</output>
                    </span>
                    <input
                      type="range"
                      aria-label="Pattern strength"
                      min={0}
                      max={100}
                      value={Math.round(design.patternOpacity * 100)}
                      onChange={(event) =>
                        changeDesign({ patternOpacity: Number(event.target.value) / 100 })
                      }
                    />
                  </label>
                )}
                <label className="field-label">
                  Border
                  <select
                    aria-label="Cover border"
                    value={design.frame}
                    onChange={(event) =>
                      changeDesign({ frame: event.target.value as CoverDesign["frame"] })
                    }
                  >
                    <option value="none">None</option>
                    <option value="single">Fine line</option>
                    <option value="double">Double line</option>
                  </select>
                </label>
                <label className="toggle-field">
                  <span>Soft cloth texture</span>
                  <input
                    type="checkbox"
                    checked={design.texture}
                    onChange={(event) => changeDesign({ texture: event.target.checked })}
                  />
                </label>
              </div>
            </details>
            <CanvasEditor
              elements={design.elements}
              values={{ title: draft.title, subtitle: draft.subtitle }}
              defaultColor="#ffffff"
              defaultFont={draft.font}
              onSourceChange={(source, value) => set(source, value)}
              onChange={(elements) => changeDesign({ elements })}
              renderCanvas={(editor) => (
                <div className="cover-workspace">
                  <BookCover book={draft} size="preview" editor={editor} />
                </div>
              )}
            />
          </>
        ) : (
          <>
            <fieldset>
              <legend>Default page layout</legend>
              <div className="choice-row">
                <button
                  type="button"
                  className={`choice ${draft.pageLayout !== "canvas" ? "selected" : ""}`}
                  aria-pressed={draft.pageLayout !== "canvas"}
                  onClick={() => set("pageLayout", "writing")}
                >
                  Normal writing
                </button>
                <button
                  type="button"
                  className={`choice ${draft.pageLayout === "canvas" ? "selected" : ""}`}
                  aria-pressed={draft.pageLayout === "canvas"}
                  onClick={() => set("pageLayout", "canvas")}
                >
                  Free layout
                </button>
              </div>
              <p className="small-note">Place text and stickers anywhere with free layout.</p>
            </fieldset>
            <PaperOptions
              color={draft.paperColor}
              pattern={draft.paperPattern}
              onColor={(color) => set("paperColor", color)}
              onPattern={(pattern) => set("paperPattern", pattern)}
            />
            <p className="small-note">
              {book
                ? "Saving updates every page using the book defaults. Pages with custom paper keep their own color and pattern."
                : "Every new page starts with this color and pattern. You can customize individual pages anytime."}
            </p>
          </>
        )}
        <fieldset>
          <legend>Collection</legend>
          <select
            aria-label="Collection"
            value={addingCollection ? "new" : draft.collectionId || ""}
            onChange={(event) => {
              setAddingCollection(event.target.value === "new");
              if (event.target.value !== "new") set("collectionId", event.target.value || null);
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
          {addingCollection && (
            <input
              aria-label="New collection name"
              placeholder="Name your collection"
              maxLength={40}
              value={collectionName}
              onChange={(event) => setCollectionName(event.target.value)}
              required
            />
          )}
        </fieldset>
        <div className="sheet-footer">
          <button className="primary-button" type="submit">
            {book ? <Check size={18} /> : <Plus size={18} />}{" "}
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
              style={{ background: value, color: paperStyle(value).color }}
              aria-label={
                [
                  "Warm ivory paper",
                  "White paper",
                  "Sage paper",
                  "Blush paper",
                  "Blue paper",
                  "Dark gray paper",
                ][index]
              }
              aria-pressed={color === value}
              onClick={() => onColor(value)}
            >
              {color === value && <Check size={17} />}
            </button>
          ))}
        </div>
      </fieldset>
      <ColorField label="Custom paper color" value={color} onChange={onColor} />
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
              <span className={`paper-sample paper-${value}`} style={paperStyle(color)} />
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
