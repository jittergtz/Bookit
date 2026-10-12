"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Heart,
  ImagePlus,
  List,
  Paintbrush,
  Plus,
  Quote,
  Trash2,
} from "lucide-react";
import {
  newDesignElement,
  newPage,
  pageText,
  paperStyle,
  resetPagePaper,
  setPageLayout,
  usesBookPaper,
  wordCount,
  type Book,
  type Page,
} from "@/lib/model";
import { PaperOptions } from "./book-form";
import { Sheet } from "./ui";
import { CanvasEditor, DesignCanvas } from "./design-canvas";

export function BookReader({
  book,
  onChange,
  onClose,
  onCustomize,
  onDelete,
}: {
  book: Book;
  onChange: (book: Book) => void;
  onClose: () => void;
  onCustomize: () => void;
  onDelete: () => void;
}) {
  const [index, setIndex] = useState(() => {
    try {
      return Math.min(
        Math.max(Number(localStorage.getItem(`bookit-position-${book.id}`)) || 0, 0),
        book.pages.length - 1,
      );
    } catch {
      return 0;
    }
  });
  const [panel, setPanel] = useState<
    "style" | "layout" | "contents" | "menu" | "delete-page" | "delete-book" | null
  >(null);
  const [direction, setDirection] = useState("next");
  const [layoutError, setLayoutError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const gesture = useRef<{ x: number; y: number; editing: boolean } | null>(null);
  const page = book.pages[Math.min(index, book.pages.length - 1)];

  useEffect(() => {
    try {
      localStorage.setItem(`bookit-position-${book.id}`, String(index));
    } catch {
      /* Position is optional. */
    }
  }, [book.id, index]);
  useEffect(() => {
    const field = textarea.current;
    if (field) {
      field.style.height = "auto";
      field.style.height = `${Math.max(field.scrollHeight, 300)}px`;
    }
  }, [page.content, page.id]);

  const editPage = (patch: Partial<Page>) => {
    const now = new Date().toISOString();
    onChange({
      ...book,
      updatedAt: now,
      pages: book.pages.map((item) =>
        item.id === page.id ? { ...item, ...patch, updatedAt: now } : item,
      ),
    });
  };
  const navigate = (next: number) => {
    if (next < 0 || next >= book.pages.length) return;
    setDirection(next > index ? "next" : "previous");
    setIndex(next);
    textarea.current?.blur();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const addPage = () => {
    const next = newPage(book);
    onChange({ ...book, updatedAt: new Date().toISOString(), pages: [...book.pages, next] });
    setDirection("next");
    setIndex(book.pages.length);
    setPanel(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const insertQuote = () => {
    if (page.layout === "canvas") {
      if ((page.elements?.length ?? 0) >= 30) return;
      editPage({
        elements: [
          ...(page.elements ?? []),
          newDesignElement({
            text: "“Your quote here”\n— ",
            font: page.font,
            fontSize: 24,
            color: paperStyle(page.paperColor).color,
          }),
        ],
      });
      setPanel("layout");
      return;
    }
    const field = textarea.current;
    const start = field?.selectionStart ?? page.content.length;
    const end = field?.selectionEnd ?? start;
    const selection = page.content.slice(start, end);
    const text = `“${selection || "Your quote here"}”\n— `;
    editPage({ content: page.content.slice(0, start) + text + page.content.slice(end) });
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + 1, start + 1 + (selection.length || 15));
    });
  };
  const switchLayout = (layout: "writing" | "canvas") => {
    try {
      editPage(setPageLayout(page, layout));
      setLayoutError("");
    } catch (cause) {
      setLayoutError(cause instanceof Error ? cause.message : "This layout could not be changed.");
    }
  };
  const addPhoto = () => {
    try {
      if (page.layout !== "canvas") editPage(setPageLayout(page, "canvas"));
      setLayoutError("");
      setPanel("layout");
    } catch (cause) {
      setLayoutError(cause instanceof Error ? cause.message : "This page could not be arranged.");
      setPanel("style");
    }
  };

  return (
    <div className="reader">
      <header className="reader-header">
        <button className="icon-button" onClick={onClose} aria-label="Back to library">
          <ArrowLeft size={22} />
        </button>
        <div>
          <span className="eyebrow">YOUR BOOK</span>
          <h1>{book.title.replace(/\n/g, " ")}</h1>
        </div>
        <button className="icon-button" onClick={() => setPanel("menu")} aria-label="Book options">
          <Ellipsis size={23} />
        </button>
      </header>
      <div className="reading-progress">
        <span
          style={{
            width: `${((index + 1) / book.pages.length) * 100}%`,
            background: book.coverColor,
          }}
        />
      </div>
      <main
        className="reader-paper-wrap"
        onTouchStart={(event) => {
          const touch = event.touches[0];
          gesture.current = {
            x: touch.clientX,
            y: touch.clientY,
            editing:
              !!(event.target as HTMLElement).closest(".design-canvas.is-editable") ||
              (document.activeElement === event.target &&
                (event.target instanceof HTMLTextAreaElement ||
                  event.target instanceof HTMLInputElement)),
          };
        }}
        onTouchEnd={(event) => {
          const start = gesture.current;
          gesture.current = null;
          if (!start || start.editing) return;
          const end = event.changedTouches[0];
          const dx = end.clientX - start.x;
          if (Math.abs(dx) > 65 && Math.abs(end.clientY - start.y) < Math.abs(dx) * 0.55)
            navigate(index + (dx < 0 ? 1 : -1));
        }}
      >
        <article
          key={page.id}
          className={`reader-paper paper-${page.paperPattern} font-${page.font} turn-${direction} ${page.layout === "canvas" ? "is-canvas" : ""}`}
          style={paperStyle(page.paperColor)}
        >
          {page.layout === "canvas" ? (
            <DesignCanvas
              elements={page.elements ?? []}
              values={{ title: page.title }}
              label="Page artwork"
            />
          ) : (
            <>
              <div className="paper-top">
                <span>
                  {new Date(page.createdAt).toLocaleDateString("en", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <span className="paper-number">{String(index + 1).padStart(2, "0")}</span>
              </div>
              {(index === 0 || page.title.trim()) && (
                <input
                  className="page-title"
                  value={page.title}
                  maxLength={160}
                  onChange={(event) => editPage({ title: event.target.value })}
                  placeholder={index === 0 ? "Give this page a title…" : undefined}
                  aria-label="Page title"
                />
              )}
              <div className="page-writing">
                <textarea
                  ref={textarea}
                  className="page-content"
                  value={page.content}
                  maxLength={100000}
                  onChange={(event) => editPage({ content: event.target.value })}
                  placeholder={
                    index === 0
                      ? "A thought, a little lesson, a moment worth keeping. Start anywhere…"
                      : undefined
                  }
                  aria-label="Page content"
                  spellCheck
                />
              </div>
              <div className="paper-bottom">
                <span>
                  {wordCount(page.content)} {wordCount(page.content) === 1 ? "word" : "words"}
                </span>
              </div>
            </>
          )}
        </article>
      </main>
      <div className="reader-tools">
        <button className="text-button" onClick={insertQuote}>
          <Quote size={16} />
          Add a quote
        </button>
        <button className="text-button" onClick={addPhoto}>
          <ImagePlus size={16} />
          Add photo
        </button>
        {page.layout === "canvas" && (
          <button className="text-button" onClick={() => setPanel("layout")}>
            <Paintbrush size={16} />
            Edit layout
          </button>
        )}
      </div>
      <footer className="reader-navigation">
        <button
          className="icon-button"
          onClick={() => navigate(index - 1)}
          disabled={index === 0}
          aria-label="Previous page"
        >
          <ChevronLeft size={22} />
        </button>
        <button className="page-counter" onClick={() => setPanel("contents")}>
          Page {Math.min(index + 1, book.pages.length)} <span>of {book.pages.length}</span>
          <ChevronDown size={14} />
        </button>
        {index === book.pages.length - 1 ? (
          <button
            className="icon-button add-page-button"
            onClick={addPage}
            disabled={book.pages.length >= 500}
            aria-label="Add page"
          >
            <Plus size={22} />
          </button>
        ) : (
          <button
            className="icon-button"
            onClick={() => navigate(index + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </footer>
      <p className="swipe-hint">Swipe the page to turn. Your thoughts stay right here.</p>

      {panel === "style" && (
        <Sheet
          title="Your page, your way"
          eyebrow={`PAGE ${index + 1}`}
          onClose={() => setPanel(null)}
        >
          <div className="sheet-content">
            <fieldset>
              <legend>Page layout</legend>
              <div className="choice-row">
                <button
                  type="button"
                  className={`choice ${page.layout !== "canvas" ? "selected" : ""}`}
                  aria-pressed={page.layout !== "canvas"}
                  onClick={() => switchLayout("writing")}
                >
                  Normal writing
                </button>
                <button
                  type="button"
                  className={`choice ${page.layout === "canvas" ? "selected" : ""}`}
                  aria-pressed={page.layout === "canvas"}
                  onClick={() => switchLayout("canvas")}
                >
                  Free layout
                </button>
              </div>
              <p className="small-note">
                Free layout lets you place text, stickers, and photos anywhere on the page.
              </p>
              {layoutError && (
                <p className="small-note" role="alert">
                  {layoutError}
                </p>
              )}
              {page.layout !== "canvas" && !!page.elements?.length && (
                <button type="button" className="text-button" onClick={() => setPanel("layout")}>
                  Edit free layout
                </button>
              )}
            </fieldset>
            <PaperOptions
              color={page.paperColor}
              pattern={page.paperPattern}
              onColor={(paperColor) => editPage({ paperColor, paperCustomized: true })}
              onPattern={(paperPattern) => editPage({ paperPattern, paperCustomized: true })}
            />
            <p className="small-note">
              {usesBookPaper(page, book)
                ? "Using book defaults. This paper updates when you change the book’s color or pattern."
                : "Custom paper for this page. Changes to the book defaults won’t affect it."}
            </p>
            {!usesBookPaper(page, book) && (
              <button
                type="button"
                className="secondary-button"
                onClick={() => editPage(resetPagePaper(page, book))}
              >
                Use book defaults
              </button>
            )}
            <fieldset>
              <legend>Writing typeface</legend>
              <div className="choice-row">
                {(["serif", "sans"] as const).map((font) => (
                  <button
                    className={`type-choice font-${font} ${page.font === font ? "selected" : ""}`}
                    key={font}
                    onClick={() => editPage({ font })}
                    aria-pressed={page.font === font}
                  >
                    <span>Aa</span>
                    {font === "serif" ? "Classic serif" : "Modern sans"}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              className="danger-link"
              onClick={() => setPanel("delete-page")}
              disabled={book.pages.length === 1}
            >
              <Trash2 size={15} />
              Delete this page
            </button>
            {book.pages.length === 1 && (
              <p className="small-note">Every book needs at least one page.</p>
            )}
            <div className="sheet-footer">
              <button
                className="primary-button"
                onClick={() => setPanel(page.layout === "canvas" ? "layout" : null)}
              >
                <Check size={18} />
                {page.layout === "canvas" ? "Arrange this page" : "Looks good"}
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {panel === "layout" && (
        <Sheet
          title="Arrange your page"
          eyebrow={`PAGE ${index + 1}`}
          onClose={() => setPanel(null)}
        >
          <div className="sheet-content">
            <CanvasEditor
              key={page.id}
              elements={page.elements ?? []}
              values={{ title: page.title }}
              defaultFont={page.font}
              defaultColor={paperStyle(page.paperColor).color}
              defaultSize={22}
              onSourceChange={(_, title) => editPage({ title })}
              onChange={(elements) => editPage({ elements })}
              renderCanvas={(editor) => (
                <div
                  className={`page-workspace paper-${page.paperPattern}`}
                  style={paperStyle(page.paperColor)}
                >
                  <DesignCanvas
                    elements={page.elements ?? []}
                    values={{ title: page.title }}
                    label="Page canvas"
                    {...editor}
                  />
                </div>
              )}
            />
            <div className="sheet-footer">
              <button className="primary-button" onClick={() => setPanel(null)}>
                <Check size={18} />
                Done
              </button>
            </div>
          </div>
        </Sheet>
      )}
      {panel === "contents" && (
        <Sheet title="Between the covers" eyebrow="YOUR PAGES" onClose={() => setPanel(null)}>
          <div className="contents-list">
            {book.pages.map((item, pageIndex) => (
              <button
                key={item.id}
                className={pageIndex === index ? "active" : ""}
                onClick={() => {
                  navigate(pageIndex);
                  setPanel(null);
                }}
              >
                <span className="contents-number">{String(pageIndex + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{item.title || `Page ${pageIndex + 1}`}</strong>
                  <p>{pageText(item).slice(0, 70)}</p>
                </div>
                <ArrowRight size={16} />
              </button>
            ))}
            <button className="contents-add" onClick={addPage} disabled={book.pages.length >= 500}>
              <Plus size={20} />
              <strong>Add a fresh page</strong>
            </button>
          </div>
        </Sheet>
      )}
      {panel === "menu" && (
        <Sheet
          title={book.title.replace(/\n/g, " ")}
          eyebrow="BOOK DETAILS"
          onClose={() => setPanel(null)}
        >
          <div className="menu-list">
            <button onClick={() => setPanel("style")}>
              <Paintbrush size={19} />
              <span>Page style</span>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => {
                setPanel(null);
                onCustomize();
              }}
            >
              <Paintbrush size={19} />
              <span>Customize this book</span>
              <ChevronRight size={16} />
            </button>
            <button
              onClick={() => {
                onChange({ ...book, favorite: !book.favorite });
                setPanel(null);
              }}
            >
              <Heart size={19} fill={book.favorite ? "currentColor" : "none"} />
              <span>{book.favorite ? "Remove from favorites" : "Keep in favorites"}</span>
              <ChevronRight size={16} />
            </button>
            <button onClick={() => setPanel("contents")}>
              <List size={19} />
              <span>All pages</span>
              <ChevronRight size={16} />
            </button>
            <button className="danger" onClick={() => setPanel("delete-book")}>
              <Trash2 size={19} />
              <span>Delete book</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </Sheet>
      )}
      {(panel === "delete-page" || panel === "delete-book") && (
        <Sheet
          title={panel === "delete-book" ? "Close this chapter?" : "Remove this page?"}
          onClose={() => setPanel(null)}
        >
          <div className="sheet-content">
            <p className="body-copy">
              {panel === "delete-book"
                ? "This will delete the book and all its pages. You can export a backup from library settings before deleting it."
                : "This page and its writing will be permanently removed from your book."}
            </p>
            <div className="confirm-actions">
              <button className="secondary-button" onClick={() => setPanel(null)}>
                Keep it
              </button>
              <button
                className="danger-button"
                onClick={() => {
                  if (panel === "delete-book") onDelete();
                  else {
                    onChange({
                      ...book,
                      updatedAt: new Date().toISOString(),
                      pages: book.pages.filter((p) => p.id !== page.id),
                    });
                    setIndex(Math.max(0, index - 1));
                    setPanel(null);
                  }
                }}
              >
                <Trash2 size={16} />
                Delete {panel === "delete-book" ? "book" : "page"}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
