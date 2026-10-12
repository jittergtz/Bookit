"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { BookOpen, Sparkles, X } from "lucide-react";
import type { Book } from "@/lib/model";

export function BookCover({
  book,
  size = "normal",
}: {
  book: Book;
  size?: "normal" | "small" | "preview";
}) {
  return (
    <div
      className={`book-cover cover-${book.coverStyle} cover-${size} font-${book.font}`}
      style={{ "--cover": book.coverColor } as CSSProperties}
    >
      <div className="cover-spine" />
      <div className="cover-grain" />
      <div className="cover-layout">
        <span className="cover-edition">A BOOK OF MY OWN</span>
        <span className="cover-title">{book.title}</span>
        <span className="cover-ornament">
          <span />
          <Sparkles size={14} strokeWidth={1.2} />
          <span />
        </span>
        <span className="cover-subtitle">{book.subtitle || "Every chapter is yours"}</span>
        <BookOpen className="cover-mark" size={17} strokeWidth={1.2} />
      </div>
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
