"use client";

import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Copy,
  ImagePlus,
  Italic,
  Maximize2,
  Redo2,
  Smile,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { designFonts, newDesignElement, newId, type DesignElement } from "@/lib/model";
import { preparePhoto } from "@/lib/photo";

export type CanvasValues = { title?: string; subtitle?: string };
type DragPreview = { id: string; x: number; y: number; width: number; mode: "move" | "resize" };
type ElementGesture = {
  id: string;
  mode: "move" | "resize";
  clientX: number;
  clientY: number;
  x: number;
  y: number;
  width: number;
  halfWidth: number;
  halfHeight: number;
  moved: boolean;
};

export function elementText(item: DesignElement, values: CanvasValues = {}) {
  return item.source === "custom" ? item.text : values[item.source] || "";
}

export function DesignCanvas({
  elements,
  values,
  selectedId,
  onSelect,
  onChange,
  label,
  children,
}: {
  elements: DesignElement[];
  values?: CanvasValues;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onChange?: (elements: DesignElement[]) => void;
  label: string;
  children?: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<ElementGesture | null>(null);
  const [drag, setDrag] = useState<DragPreview | null>(null);
  const editable = !!onChange;
  const showingGuides = drag?.mode === "move";
  const position = (x: number, y: number, halfWidth: number, halfHeight: number) => ({
    x: Math.max(halfWidth, Math.min(100 - halfWidth, Math.abs(x - 50) < 1.2 ? 50 : x)),
    y: Math.max(halfHeight, Math.min(100 - halfHeight, Math.abs(y - 50) < 1.2 ? 50 : y)),
  });
  return (
    <div
      ref={root}
      className={`design-canvas ${editable ? "is-editable" : ""}`}
      role="group"
      aria-label={label}
      onClick={(event) => {
        if (event.target === event.currentTarget) onSelect?.(null);
      }}
    >
      {children}
      {showingGuides && Math.abs(drag.x - 50) < 0.1 && <span className="canvas-guide guide-x" />}
      {showingGuides && Math.abs(drag.y - 50) < 0.1 && <span className="canvas-guide guide-y" />}
      {elements.map((item, index) => {
        const text = elementText(item, values);
        const active = selectedId === item.id;
        const current = drag?.id === item.id ? drag : item;
        const style: CSSProperties = {
          left: `${current.x}%`,
          top: `${current.y}%`,
          width: `${current.width}%`,
          fontSize: `${item.fontSize / 3}cqw`,
          color: item.color,
          fontWeight: item.bold ? 700 : 400,
          fontStyle: item.italic ? "italic" : "normal",
          textDecoration: item.underline ? "underline" : "none",
          textAlign: item.align,
          transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
        };
        const layerName =
          item.kind === "image"
            ? "Photo"
            : item.kind === "sticker"
              ? "Sticker"
              : item.source === "title"
                ? "Title"
                : item.source === "subtitle"
                  ? "Subtitle"
                  : "Text";
        const label = `${layerName} layer ${index + 1}`;
        return (
          <div
            key={item.id}
            className={`design-element font-${item.font} ${active ? "is-selected" : ""} element-${item.kind}`}
            style={style}
            role={editable ? "group" : undefined}
            tabIndex={editable ? 0 : undefined}
            aria-label={editable ? label : undefined}
            onClick={(event) => {
              if (editable) {
                event.stopPropagation();
                onSelect?.(item.id);
              }
            }}
            onPointerDown={(event) => {
              if (!editable || event.button !== 0) return;
              if ((event.target as HTMLElement).closest("[data-image-resize]")) return;
              event.preventDefault();
              event.stopPropagation();
              event.currentTarget.focus({ preventScroll: true });
              onSelect?.(item.id);
              const canvas = root.current!.getBoundingClientRect();
              const box = event.currentTarget.getBoundingClientRect();
              gesture.current = {
                id: item.id,
                mode: "move",
                clientX: event.clientX,
                clientY: event.clientY,
                x: item.x,
                y: item.y,
                width: item.width,
                halfWidth: Math.min(47.5, (box.width / canvas.width) * 50),
                halfHeight: Math.min(47.5, (box.height / canvas.height) * 50),
                moved: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = gesture.current;
              if (!start || start.id !== item.id) return;
              const canvas = root.current!.getBoundingClientRect();
              const dx = event.clientX - start.clientX,
                dy = event.clientY - start.clientY;
              if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
              if (start.moved && start.mode === "resize") {
                const width = Math.max(10, Math.min(95, start.width + (dx / canvas.width) * 100));
                const bounds = position(
                  start.x,
                  start.y,
                  Math.min(47.5, width / 2),
                  Math.min(47.5, start.halfHeight * (width / start.width)),
                );
                setDrag({
                  id: item.id,
                  mode: start.mode,
                  ...bounds,
                  width,
                });
              } else if (start.moved)
                setDrag({
                  id: item.id,
                  mode: start.mode,
                  width: start.width,
                  ...position(
                    start.x + (dx / canvas.width) * 100,
                    start.y + (dy / canvas.height) * 100,
                    start.halfWidth,
                    start.halfHeight,
                  ),
                });
            }}
            onPointerUp={(event) => {
              const start = gesture.current;
              if (!start || start.id !== item.id) return;
              if (start.moved && drag)
                onChange?.(
                  elements.map((layer) =>
                    layer.id === item.id
                      ? start.mode === "resize"
                        ? { ...layer, width: drag.width, x: drag.x, y: drag.y }
                        : { ...layer, x: drag.x, y: drag.y }
                      : layer,
                  ),
                );
              gesture.current = null;
              setDrag(null);
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              gesture.current = null;
              setDrag(null);
            }}
            onKeyDown={(event) => {
              if (!editable) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(item.id);
              }
              if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                const step = event.shiftKey ? 5 : 1;
                const canvas = root.current!.getBoundingClientRect(),
                  box = event.currentTarget.getBoundingClientRect();
                const next = position(
                  item.x +
                    (event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0),
                  item.y + (event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0),
                  Math.min(47.5, (box.width / canvas.width) * 50),
                  Math.min(47.5, (box.height / canvas.height) * 50),
                );
                onChange?.(
                  elements.map((layer) => (layer.id === item.id ? { ...layer, ...next } : layer)),
                );
              }
            }}
          >
            {item.kind === "image" ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image} alt="Photo on page" draggable={false} />
                {editable && active && (
                  <span
                    className="image-resize-handle"
                    data-image-resize
                    role="slider"
                    tabIndex={0}
                    aria-label="Resize photo"
                    aria-valuemin={10}
                    aria-valuemax={95}
                    aria-valuenow={Math.round(current.width)}
                    aria-valuetext={`${Math.round(current.width)} percent of page width`}
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.currentTarget.focus({ preventScroll: true });
                      onSelect?.(item.id);
                      const canvas = root.current!.getBoundingClientRect();
                      gesture.current = {
                        id: item.id,
                        mode: "resize",
                        clientX: event.clientX,
                        clientY: event.clientY,
                        x: item.x,
                        y: item.y,
                        width: item.width,
                        halfWidth: Math.min(
                          47.5,
                          (event.currentTarget.parentElement!.getBoundingClientRect().width /
                            canvas.width) *
                            50,
                        ),
                        halfHeight: Math.min(
                          47.5,
                          (event.currentTarget.parentElement!.getBoundingClientRect().height /
                            canvas.height) *
                            50,
                        ),
                        moved: false,
                      };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"].includes(event.key))
                        return;
                      event.preventDefault();
                      event.stopPropagation();
                      const step = event.shiftKey ? 5 : 1;
                      const change =
                        event.key === "ArrowLeft" || event.key === "ArrowDown" ? -step : step;
                      onChange?.(
                        elements.map((layer) =>
                          layer.id === item.id
                            ? { ...layer, width: Math.max(10, Math.min(95, layer.width + change)) }
                            : layer,
                        ),
                      );
                    }}
                  >
                    <Maximize2 size={14} aria-hidden="true" />
                  </span>
                )}
              </>
            ) : (
              text ||
              (editable ? (
                <span className="canvas-empty-label">
                  {item.source === "custom"
                    ? "Text"
                    : item.source === "title"
                      ? "Your title"
                      : "Subtitle"}
                </span>
              ) : null)
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [invalid, setInvalid] = useState<string | null>(null);
  return (
    <label className="color-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => {
            setInvalid(null);
            onChange(event.target.value);
          }}
        />
        <input
          aria-label={`${label} hex`}
          value={invalid ?? value}
          maxLength={7}
          spellCheck={false}
          onChange={(event) => {
            const next = event.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(next)) {
              setInvalid(null);
              onChange(next);
            } else setInvalid(next);
          }}
          onBlur={() => setInvalid(null)}
        />
      </div>
    </label>
  );
}

export function CanvasEditor({
  elements,
  onChange,
  values,
  onSourceChange,
  renderCanvas,
  defaultColor = "#171717",
  defaultFont = "serif",
  defaultSize = 24,
}: {
  elements: DesignElement[];
  onChange: (elements: DesignElement[]) => void;
  values?: CanvasValues;
  onSourceChange?: (source: "title" | "subtitle", value: string) => void;
  renderCanvas: (props: {
    selectedId: string | null;
    onSelect: (id: string | null) => void;
    onChange: (elements: DesignElement[]) => void;
  }) => ReactNode;
  defaultColor?: string;
  defaultFont?: DesignElement["font"];
  defaultSize?: number;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [customSticker, setCustomSticker] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<{ past: DesignElement[][]; future: DesignElement[][] }>({
    past: [],
    future: [],
  });
  const file = useRef<HTMLInputElement>(null);
  const selected = elements.find((item) => item.id === selectedId);
  const commit = (next: DesignElement[]) => {
    if (JSON.stringify(next) === JSON.stringify(elements)) return;
    setHistory((previous) => ({ past: [...previous.past, elements].slice(-40), future: [] }));
    onChange(next);
  };
  const change = (patch: Partial<DesignElement>) =>
    commit(elements.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)));
  const add = (patch: Partial<DesignElement>) => {
    if (elements.length >= 30) {
      setError("This canvas has reached its 30-layer limit.");
      return;
    }
    const item = newDesignElement({
      color: defaultColor,
      font: defaultFont,
      fontSize: defaultSize,
      ...patch,
    });
    commit([...elements, item]);
    setSelectedId(item.id);
    setShowStickers(false);
  };
  const upload = async (imageFile?: File) => {
    if (!imageFile) return;
    setUploading(true);
    setError("");
    try {
      const image = await preparePhoto(imageFile);
      add({ kind: "image", image, width: 35, text: "" });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This image could not be opened.");
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  };
  return (
    <div className="canvas-editor">
      {renderCanvas({ selectedId, onSelect: setSelectedId, onChange: commit })}
      <p className="canvas-hint">
        Tap a layer to edit. Drag to move it, or drag the photo corner to resize. Center guides help
        align.
      </p>
      <div className="canvas-toolbar" aria-label="Canvas tools">
        <button type="button" onClick={() => add({ text: "" })} disabled={elements.length >= 30}>
          <Type size={17} />
          Text
        </button>
        <button
          type="button"
          onClick={() => setShowStickers(!showStickers)}
          aria-expanded={showStickers}
        >
          <Smile size={17} />
          Sticker
        </button>
        <button
          type="button"
          onClick={() => file.current?.click()}
          disabled={elements.length >= 30 || uploading}
        >
          <ImagePlus size={17} />
          {uploading ? "Opening photo…" : "Add photo"}
        </button>
        <button
          type="button"
          aria-label="Undo canvas change"
          disabled={!history.past.length}
          onClick={() => {
            const previous = history.past.at(-1)!;
            setHistory({ past: history.past.slice(0, -1), future: [elements, ...history.future] });
            onChange(previous);
          }}
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          aria-label="Redo canvas change"
          disabled={!history.future.length}
          onClick={() => {
            setHistory({ past: [...history.past, elements], future: history.future.slice(1) });
            onChange(history.future[0]);
          }}
        >
          <Redo2 size={17} />
        </button>
      </div>
      <input
        ref={file}
        type="file"
        accept="image/*"
        className="visually-hidden"
        aria-label="Add a photo or image"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      {error && (
        <p className="small-note" role="alert">
          {error}
        </p>
      )}
      {showStickers && (
        <div className="sticker-picker">
          <div>
            {[
              "✦",
              "♡",
              "☀",
              "☾",
              "✿",
              "🌿",
              "🍋",
              "🦋",
              "📷",
              "✨",
              "🌼",
              "🪩",
              "🌊",
              "🍒",
              "🎧",
              "🧿",
            ].map((sticker) => (
              <button
                type="button"
                key={sticker}
                aria-label={`Add ${sticker} sticker`}
                onClick={() => add({ kind: "sticker", text: sticker, width: 25, fontSize: 48 })}
              >
                {sticker}
              </button>
            ))}
          </div>
          <label className="field-label">
            Your own symbol or emoji
            <input
              aria-label="Custom sticker"
              value={customSticker}
              maxLength={12}
              onChange={(event) => setCustomSticker(event.target.value)}
              placeholder="e.g. ☁ or 🐈"
            />
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={!customSticker.trim()}
            onClick={() => {
              add({ kind: "sticker", text: customSticker.trim(), width: 25, fontSize: 48 });
              setCustomSticker("");
            }}
          >
            Add custom sticker
          </button>
        </div>
      )}
      {!!elements.length && (
        <div className="layer-list" aria-label="Canvas layers">
          {elements.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={selectedId === item.id ? "active" : ""}
              aria-pressed={selectedId === item.id}
              onClick={() => setSelectedId(item.id)}
            >
              {item.kind === "image"
                ? "Photo"
                : item.kind === "sticker"
                  ? item.text
                  : item.source === "title"
                    ? "Title"
                    : item.source === "subtitle"
                      ? "Subtitle"
                      : item.text.slice(0, 18) || `Text ${index + 1}`}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="layer-inspector">
          <div className="inspector-heading">
            <strong>
              {selected.kind === "text"
                ? "Text style"
                : selected.kind === "image"
                  ? "Photo"
                  : "Sticker style"}
            </strong>
            <div>
              <button
                type="button"
                className="icon-button"
                aria-label="Duplicate layer"
                disabled={elements.length >= 30}
                onClick={() =>
                  add({
                    ...selected,
                    id: newId(),
                    x: Math.min(90, selected.x + 3),
                    y: Math.min(90, selected.y + 3),
                  })
                }
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Remove layer"
                onClick={() => {
                  commit(elements.filter((item) => item.id !== selected.id));
                  setSelectedId(null);
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          {selected.kind !== "image" && (
            <label className="field-label">
              {selected.source === "title"
                ? "Title"
                : selected.source === "subtitle"
                  ? "Subtitle"
                  : "Text"}
              <textarea
                aria-label="Layer text"
                rows={2}
                value={elementText(selected, values)}
                maxLength={
                  selected.source === "title"
                    ? 80
                    : selected.source === "subtitle"
                      ? 120
                      : selected.kind === "sticker"
                        ? 12
                        : 100_000
                }
                placeholder="Write your text…"
                onChange={(event) =>
                  selected.source !== "custom" && onSourceChange
                    ? onSourceChange(selected.source, event.target.value)
                    : change({ text: event.target.value })
                }
              />
            </label>
          )}
          {selected.kind === "text" && (
            <>
              <label className="field-label">
                Typeface
                <select
                  aria-label="Layer typeface"
                  value={selected.font}
                  onChange={(event) =>
                    change({ font: event.target.value as DesignElement["font"] })
                  }
                >
                  {designFonts.map((font) => (
                    <option key={font} value={font}>
                      {
                        {
                          serif: "Classic serif",
                          sans: "Modern sans",
                          mono: "Typewriter",
                          handwritten: "Handwritten",
                        }[font]
                      }
                    </option>
                  ))}
                </select>
              </label>
              <div className="format-buttons" aria-label="Text formatting">
                {(
                  [
                    { key: "bold", icon: Bold, name: "Bold" },
                    { key: "italic", icon: Italic, name: "Italic" },
                    { key: "underline", icon: Underline, name: "Underline" },
                  ] as const
                ).map(({ key, icon: Icon, name }) => (
                  <button
                    type="button"
                    key={key}
                    aria-label={name}
                    aria-pressed={selected[key]}
                    className={selected[key] ? "active" : ""}
                    onClick={() => change({ [key]: !selected[key] })}
                  >
                    <Icon size={18} />
                  </button>
                ))}
                <span />
                {(
                  [
                    { value: "left", icon: AlignLeft },
                    { value: "center", icon: AlignCenter },
                    { value: "right", icon: AlignRight },
                  ] as const
                ).map(({ value, icon: Icon }) => (
                  <button
                    type="button"
                    key={value}
                    aria-label={`Align ${value}`}
                    aria-pressed={selected.align === value}
                    className={selected.align === value ? "active" : ""}
                    onClick={() => change({ align: value })}
                  >
                    <Icon size={18} />
                  </button>
                ))}
              </div>
            </>
          )}
          {selected.kind !== "image" && (
            <>
              <ColorField
                label="Text color"
                value={selected.color}
                onChange={(color) => change({ color })}
              />
              <label className="range-field">
                <span>
                  Text size <output>{selected.fontSize}</output>
                </span>
                <input
                  type="range"
                  aria-label="Text size"
                  min={10}
                  max={96}
                  value={selected.fontSize}
                  onChange={(event) => change({ fontSize: Number(event.target.value) })}
                />
              </label>
            </>
          )}
          <label className="range-field">
            <span>
              Width <output>{selected.width}%</output>
            </span>
            <input
              type="range"
              aria-label="Layer width"
              min={10}
              max={95}
              value={selected.width}
              onChange={(event) => change({ width: Number(event.target.value) })}
            />
          </label>
          <div className="position-fields">
            <label>
              Horizontal
              <input
                aria-label="Horizontal position"
                type="number"
                min={0}
                max={100}
                value={Math.round(selected.x)}
                onChange={(event) =>
                  change({ x: Math.max(0, Math.min(100, Number(event.target.value))) })
                }
              />
            </label>
            <label>
              Vertical
              <input
                aria-label="Vertical position"
                type="number"
                min={0}
                max={100}
                value={Math.round(selected.y)}
                onChange={(event) =>
                  change({ y: Math.max(0, Math.min(100, Number(event.target.value))) })
                }
              />
            </label>
            <button type="button" onClick={() => change({ x: 50, y: 50, align: "center" })}>
              Center on canvas
            </button>
          </div>
          <label className="range-field">
            <span>
              Rotation <output>{selected.rotation}°</output>
            </span>
            <input
              type="range"
              aria-label="Layer rotation"
              min={-180}
              max={180}
              value={selected.rotation}
              onChange={(event) => change({ rotation: Number(event.target.value) })}
            />
          </label>
          <div className="choice-row">
            <button
              type="button"
              className="choice"
              onClick={() =>
                commit([...elements.filter((item) => item.id !== selected.id), selected])
              }
            >
              Bring to front
            </button>
            <button
              type="button"
              className="choice"
              onClick={() =>
                commit([selected, ...elements.filter((item) => item.id !== selected.id)])
              }
            >
              Send to back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
