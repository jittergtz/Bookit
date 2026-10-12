"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { X } from "lucide-react";
import {
  coverFill,
  coverPattern,
  getCoverDesign,
  type Book,
  type DesignElement,
} from "@/lib/model";
import { DesignCanvas } from "./design-canvas";

export function BookCover({
  book,
  size = "normal",
  editor,
}: {
  book: Book;
  size?: "normal" | "small" | "preview";
  editor?: {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onChange: (elements: DesignElement[]) => void;
  };
}) {
  const design = getCoverDesign(book);
  return (
    <div
      className={`book-cover cover-${size} ${editor ? "cover-editing" : ""}`}
      style={
        {
          "--cover": book.coverColor,
          backgroundImage: coverFill(book.coverColor, design),
        } as CSSProperties
      }
    >
      <div className="cover-spine" />
      {design.texture && <div className="cover-grain" />}
      <div
        className="cover-pattern"
        style={{ ...coverPattern(design), opacity: design.patternOpacity }}
      />
      {design.frame !== "none" && (
        <div
          className={`cover-border border-${design.frame}`}
          style={{ borderColor: design.patternColor }}
        />
      )}
      <DesignCanvas
        elements={design.elements}
        values={{ title: book.title, subtitle: book.subtitle }}
        label={editor ? "Cover canvas" : `${book.title} cover`}
        {...editor}
      />
      <span className="cover-pages" />
    </div>
  );
}

export function Sheet({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previous;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? "sheet-wide" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="sheet-title"
    >
      <div className="sheet-surface">
        <div className="sheet-handle" />
        <header className="sheet-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="sheet-title">{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={21} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
