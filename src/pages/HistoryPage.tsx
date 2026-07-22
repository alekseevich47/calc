import { useState, useRef, useEffect, useMemo, type CSSProperties } from "react";
import { Calendar, SlidersHorizontal, X, Check, ChevronDown, ChevronUp, Trash2, Plus, Search } from "lucide-react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router";
import type { CachedShift } from "../lib/db";
import { markingNumberDisplayMeta, markingTypesMap, uniqueMarkingNumbers } from "../lib/db";
import { markingNumberImageUrl } from "../lib/pocketbase";
import {
  buildParticipantOptions,
  formatRuDate,
  fromIsoDate,
  isShiftRowComplete,
  removeShift,
  updateShift,
  useDictionaries,
  useShifts,
} from "../lib/sync";
import { getCurrentUserFullName } from "../lib/session";
import type { ShellContext } from "./AppShell";

type MarkingNumMeta = {
  description?: string;
  imageUrls: string[];
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkRow {
  location: string;
  markingNum: string;
  markingType: string;
  volume: number;
  material: string;
  tariff: number;
}

interface Shift {
  id: string;
  date: string;       // "DD.MM.YYYY"
  dateObj: Date;
  isoDate: string;
  participants: string[];
  rows: WorkRow[];
  pendingSync?: boolean;
}

type EditDraftRow = {
  location: string;
  markingNum: string;
  markingType: string;
  volume: string;
  material: string;
  tariff: string;
};

function cachedToShift(s: CachedShift): Shift {
  return {
    id: s.id,
    date: formatRuDate(s.date),
    dateObj: fromIsoDate(s.date),
    isoDate: s.date,
    participants: s.participants,
    rows: s.rows.map((r) => ({
      location: r.location,
      markingNum: r.markingNum,
      markingType: r.markingType,
      volume: r.volume,
      material: r.material,
      tariff: r.tariff,
    })),
    pendingSync: s.pendingSync,
  };
}

function initials(name: string) {
  const parts = name.split(" ");
  if (parts.length >= 3) return `${parts[0]} ${parts[1][0]}.${parts[2][0]}.`;
  if (parts.length === 2) return `${parts[0]} ${parts[1][0]}.`;
  return name;
}

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}

function fmtVol(n: number) {
  return n.toLocaleString("ru-RU") + " м²";
}

function shiftTotal(shift: Shift) {
  return shift.rows.reduce((s, r) => s + r.volume * r.tariff, 0);
}

function perPerson(shift: Shift) {
  const total = shiftTotal(shift);
  const n = shift.participants.length;
  if (n <= 0) return 0;
  return Math.round(total / n);
}

const SWIPE_SNAP = 80;
/** Порог свайп vs скролл (после него long-press отменяется). */
const DIRECTION_THRESHOLD = 12;
/** Допуск дрожания пальца, пока ждём long-press (должен быть ≥ DIRECTION_THRESHOLD). */
const LONG_PRESS_MOVE_PX = 16;
const LONG_PRESS_MS = 480;

// ─── Mini calendar (date-range picker) ───────────────────────────────────────

interface DateRange { from: Date | null; to: Date | null }

function MiniCalendar({ range, onChange, onClose, top, left }: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  onClose: () => void;
  top: number;
  left: number;
}) {
  const [viewDate, setViewDate] = useState(() => new Date(2025, 5, 1));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthName = viewDate.toLocaleString("ru-RU", { month: "long", year: "numeric" });

  const firstDay = new Date(year, month, 1).getDay();
  const startOffset = (firstDay + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  function handleDay(d: Date) {
    if (!range.from || (range.from && range.to)) {
      onChange({ from: d, to: null });
    } else {
      if (d < range.from) onChange({ from: d, to: range.from });
      else onChange({ from: range.from, to: d });
    }
  }

  function inRange(d: Date) {
    if (!range.from || !range.to) return false;
    return d > range.from && d < range.to;
  }

  function isEdge(d: Date) {
    return (range.from && d.toDateString() === range.from.toDateString()) ||
      (range.to && d.toDateString() === range.to.toDateString());
  }

  const W = 280;
  const [containerW, setContainerW] = useState(W + 16);

  useEffect(() => {
    const portal = document.getElementById("app-portal");
    if (!portal) return;
    const update = () => setContainerW(portal.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(portal);
    return () => ro.disconnect();
  }, []);

  const clampedLeft = Math.max(8, Math.min(left, containerW - W - 8));

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, zIndex: 300 }} />
      <div style={{
        position: "absolute", top, left: clampedLeft,
        width: W, zIndex: 301, pointerEvents: "auto",
        background: "rgba(255,255,255,0.97)", backdropFilter: "blur(24px)",
        borderRadius: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
        border: "1px solid rgba(0,0,0,0.07)", padding: "14px 14px 10px",
        fontFamily: "Inter, sans-serif",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.05)", cursor: "pointer", color: "#374151", fontSize: 14 }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", textTransform: "capitalize" }}>{monthName}</span>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.05)", cursor: "pointer", color: "#374151", fontSize: 14 }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map(d => (
            <div key={d} style={{ fontSize: 10, textAlign: "center", color: "#9ca3af", fontWeight: 600, padding: "2px 0", letterSpacing: "0.03em" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const edge = isEdge(d);
            const inside = inRange(d);
            return (
              <button key={i} onClick={() => handleDay(d)} style={{
                height: 30, borderRadius: 8, border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: edge ? 700 : 400,
                background: edge ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : inside ? "rgba(255,107,0,0.10)" : "transparent",
                color: edge ? "#fff" : inside ? "#FF6B00" : "#111827",
              }}>
                {d.getDate()}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <button onClick={() => onChange({ from: null, to: null })} style={{ flex: 1, height: 32, borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", background: "transparent", fontSize: 12, color: "#6b7280", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Сбросить</button>
          <button onClick={onClose} style={{ flex: 1, height: 32, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#FF6B00,#FF9A00)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Готово</button>
        </div>
      </div>
    </>,
    document.getElementById("app-portal")!,
  );
}

// ─── Filter sheet ─────────────────────────────────────────────────────────────

function FilterSheet({ selected, onChange, onClose, options }: {
  selected: string[];
  onChange: (v: string[]) => void;
  onClose: () => void;
  options: string[];
}) {
  const [local, setLocal] = useState<string[]>(selected);

  function toggle(p: string) {
    setLocal(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  }

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "absolute", inset: 0, zIndex: 200, pointerEvents: "auto",
      background: "rgba(0,0,0,0.35)",
      display: "flex", alignItems: "flex-end",
    }}>
      <div style={{
        width: "100%", background: "rgba(248,249,252,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: "24px 24px 0 0", padding: "16px 20px 32px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
        fontFamily: "Inter, sans-serif",
        animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
      }}>
        <style>{`@keyframes sheetUp { from { transform:translateY(100%); } to { transform:translateY(0); } }`}</style>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>Фильтр по участникам</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", outline: "none", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {options.map(p => {
            const on = local.includes(p);
            return (
              <button key={p} onClick={() => toggle(p)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 16px", borderRadius: 14, border: "none", cursor: "pointer",
                background: on ? "rgba(99,102,241,0.08)" : "rgba(0,0,0,0.04)",
                fontFamily: "Inter, sans-serif", outline: "none",
                transition: "background 0.15s",
              }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{p}</span>
                <div style={{
                  width: 22, height: 22, borderRadius: 7, border: on ? "none" : "1.5px solid #d1d5db",
                  background: on ? "linear-gradient(135deg,#6366f1,#818cf8)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {on && <Check size={13} strokeWidth={2.5} color="#fff" />}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button onClick={() => { onChange([]); onClose(); }} style={{ flex: 1, height: 44, borderRadius: 12, border: "1.5px solid rgba(0,0,0,0.10)", background: "transparent", fontSize: 14, color: "#6b7280", fontFamily: "Inter, sans-serif", cursor: "pointer" }}>
            Сбросить
          </button>
          <button onClick={() => { onChange(local); onClose(); }} style={{ flex: 2, height: 44, borderRadius: 12, border: "none", background: "linear-gradient(135deg,#6366f1,#818cf8)", color: "#fff", fontSize: 14, fontWeight: 600, fontFamily: "Inter, sans-serif", cursor: "pointer", boxShadow: "0 4px 14px rgba(99,102,241,0.30)" }}>
            Применить
          </button>
        </div>
      </div>
    </div>,
    document.getElementById("app-portal")!,
  );
}

// ─── Context menu (long-press) ────────────────────────────────────────────────

function ContextMenu({ x, y, onEdit, onDelete, onClose }: {
  x: number; y: number;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const menuW = 188;
  const [left, setLeft] = useState(x);
  const dismissReady = useRef(false);

  useEffect(() => {
    const portal = document.getElementById("app-portal");
    if (!portal) return;
    const pw = portal.getBoundingClientRect().width;
    setLeft(Math.max(12, Math.min(x, pw - menuW - 12)));
  }, [x]);

  // После long-press не закрывать по «хвостовому» pointer/click
  useEffect(() => {
    dismissReady.current = false;
    const t = setTimeout(() => { dismissReady.current = true; }, 280);
    return () => clearTimeout(t);
  }, []);

  function tryDismiss() {
    if (!dismissReady.current) return;
    onClose();
  }

  return createPortal(
    <>
      <div
        onPointerDown={(e) => { e.preventDefault(); tryDismiss(); }}
        onClick={(e) => { e.preventDefault(); tryDismiss(); }}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: "absolute", inset: 0, zIndex: 400, pointerEvents: "auto" }}
      />
      <div style={{
        position: "absolute", top: Math.max(12, y), left, width: menuW, zIndex: 401,
        pointerEvents: "auto",
        background: "rgba(255,255,255,0.98)", backdropFilter: "blur(20px)",
        borderRadius: 14, border: "1px solid rgba(0,0,0,0.08)",
        boxShadow: "0 12px 36px rgba(0,0,0,0.18)",
        overflow: "hidden", fontFamily: "Inter, sans-serif",
        animation: "fadeUp 0.16s ease forwards",
      }}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClose(); onEdit(); }}
          style={{
            width: "100%", display: "flex", alignItems: "center",
            padding: "13px 16px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "Inter, sans-serif", outline: "none",
            borderBottom: "1px solid rgba(0,0,0,0.06)",
            fontSize: 14, fontWeight: 500, color: "#111827", textAlign: "left",
          }}
        >
          Редактировать
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onClose(); onDelete(); }}
          style={{
            width: "100%", display: "flex", alignItems: "center",
            padding: "13px 16px", border: "none", background: "none", cursor: "pointer",
            fontFamily: "Inter, sans-serif", outline: "none",
            fontSize: 14, fontWeight: 500, color: "#ef4444", textAlign: "left",
          }}
        >
          Удалить
        </button>
      </div>
    </>,
    document.getElementById("app-portal")!,
  );
}

function RestorePlaceholder({ onRestore }: { onRestore: () => void }) {
  return (
    <div style={{
      borderRadius: 18,
      background: "rgba(0,0,0,0.04)",
      border: "1px dashed rgba(0,0,0,0.10)",
      padding: "14px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 64,
      animation: "fadeUp 0.18s ease forwards",
    }}>
      <button
        type="button"
        onClick={onRestore}
        style={{
          height: 36, padding: "0 18px", borderRadius: 12, border: "none", cursor: "pointer",
          background: "rgba(255,255,255,0.9)",
          boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
          fontSize: 13, fontWeight: 600, color: "#374151",
          fontFamily: "Inter, sans-serif", outline: "none",
        }}
      >
        Восстановить
      </button>
    </div>
  );
}

// ─── Custom select (как на главной; без нативного <select> — иначе iOS/Safari сбрасывает value вне options) ─

function withCurrentOption(options: string[], current: string): string[] {
  const v = current.trim();
  if (!v) return options;
  return options.includes(v) ? options : [v, ...options];
}

function EditFieldSelect({
  label, value, options, disabled, withSearch, onChange, optionMeta,
}: {
  label: string;
  value: string;
  options: string[];
  disabled?: boolean;
  withSearch?: boolean;
  onChange: (v: string) => void;
  optionMeta?: Record<string, MarkingNumMeta>;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240 });
  const [query, setQuery] = useState("");
  const rich = Boolean(optionMeta);

  const opts = withCurrentOption(options, value);
  const q = query.toLowerCase();
  const filtered = opts.filter((o) => {
    if (!q) return true;
    if (o.toLowerCase().includes(q)) return true;
    const desc = optionMeta?.[o]?.description;
    return Boolean(desc && desc.toLowerCase().includes(q));
  });

  function openMenu() {
    if (disabled || !btnRef.current) return;
    const portal = document.getElementById("app-portal");
    if (!portal) return;
    const pb = portal.getBoundingClientRect();
    const tb = btnRef.current.getBoundingClientRect();
    const width = Math.max(tb.width, rich ? 280 : 220);
    let left = tb.left - pb.left;
    if (left + width > pb.width - 8) left = pb.width - width - 8;
    if (left < 8) left = 8;
    const listH = rich ? 280 : 220;
    let top = tb.bottom - pb.top + 4;
    if (top + listH > pb.height - 8) top = Math.max(8, tb.top - pb.top - listH);
    setPos({ top, left, width });
    setQuery("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    let remove: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {
      const h = (e: PointerEvent) => {
        const el = document.getElementById("edit-dd-card");
        if (el && !el.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener("pointerdown", h);
      remove = () => document.removeEventListener("pointerdown", h);
    });
    return () => {
      cancelAnimationFrame(raf);
      remove?.();
    };
  }, [open]);

  const fieldStyle: CSSProperties = {
    width: "100%", height: 40, borderRadius: 10, border: `1px solid ${open ? "rgba(99,102,241,0.45)" : "rgba(0,0,0,0.10)"}`,
    background: disabled ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.9)",
    padding: "0 10px", fontSize: 13, color: value ? "#111827" : "#9ca3af",
    fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box",
    display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
    cursor: disabled ? "not-allowed" : "pointer",
    boxShadow: open ? "0 0 0 3px rgba(99,102,241,0.10)" : "none",
    WebkitTapHighlightColor: "transparent",
  };

  const portal = document.getElementById("app-portal");

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        style={fieldStyle}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: value ? 500 : 400 }}>
          {value || label}
        </span>
        <ChevronDown size={14} strokeWidth={2} color="#9ca3af" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && portal && createPortal(
        <div id="edit-dd-card" style={{
          position: "absolute", top: pos.top, left: pos.left, width: pos.width, zIndex: 300, pointerEvents: "auto",
          background: "rgba(255,255,255,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(0,0,0,0.09)", borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.16)", overflow: "hidden",
          animation: "fadeUp 0.16s ease forwards", fontFamily: "Inter, sans-serif",
        }}>
          {withSearch && (
            <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              <div style={{ position: "relative" }}>
                <Search size={13} strokeWidth={2} color="#9ca3af" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск..."
                  inputMode="search"
                  style={{
                    width: "100%", height: 32, borderRadius: 8, border: "1px solid rgba(0,0,0,0.09)",
                    background: "rgba(0,0,0,0.03)", padding: "0 10px 0 28px", fontSize: 13,
                    color: "#111827", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          )}
          <div style={{ maxHeight: rich ? 280 : 200, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
            {filtered.map((opt) => {
              const sel = opt === value;
              const meta = optionMeta?.[opt];
              const imgs = meta?.imageUrls ?? [];
              const desc = meta?.description?.trim();
              if (rich) {
                return (
                  <button
                    key={opt}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => { onChange(opt); setOpen(false); }}
                    style={{
                      width: "100%", padding: "10px 14px",
                      display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4,
                      background: sel ? "rgba(99,102,241,0.08)" : "transparent",
                      border: "none", borderBottom: "1px solid rgba(0,0,0,0.04)",
                      cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
                      WebkitTapHighlightColor: "transparent", textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 13, color: sel ? "#4f46e5" : "#111827", fontWeight: sel ? 600 : 500 }}>{opt}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", flexShrink: 0 }}>
                        {imgs.slice(0, 3).map((src) => (
                          <img key={src} src={src} alt="" loading="lazy" style={{ width: 36, height: 28, objectFit: "contain", borderRadius: 4, background: "rgba(0,0,0,0.03)", display: "block" }} />
                        ))}
                        {sel && <Check size={14} strokeWidth={2.5} color="#6366f1" />}
                      </div>
                    </div>
                    {desc ? <span style={{ fontSize: 11, fontWeight: 300, color: "#9ca3af", lineHeight: 1.35 }}>{desc}</span> : null}
                  </button>
                );
              }
              return (
                <button
                  key={opt}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(opt); setOpen(false); }}
                  style={{
                    width: "100%", minHeight: 40, padding: "0 14px",
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: sel ? "rgba(99,102,241,0.08)" : "transparent",
                    border: "none", borderBottom: "1px solid rgba(0,0,0,0.04)",
                    cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span style={{ fontSize: 13, color: sel ? "#4f46e5" : "#111827", fontWeight: sel ? 600 : 400 }}>{opt}</span>
                  {sel && <Check size={14} strokeWidth={2.5} color="#6366f1" />}
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ padding: 14, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Нет совпадений</div>
            )}
          </div>
        </div>,
        portal,
      )}
    </>
  );
}

// ─── Edit shift sheet ─────────────────────────────────────────────────────────

function EditShiftSheet({ shift, participantOptions, onClose }: {
  shift: Shift;
  participantOptions: string[];
  onClose: () => void;
}) {
  const dicts = useDictionaries();
  const typeMap = useMemo(() => (dicts ? markingTypesMap(dicts) : {}), [dicts]);
  const locations = dicts?.locations.map((x) => x.name) ?? [];
  const markingNums = dicts ? uniqueMarkingNumbers(dicts) : [];
  const markingNumMeta = useMemo(() => {
    const map: Record<string, MarkingNumMeta> = {};
    if (!dicts) return map;
    const raw = markingNumberDisplayMeta(dicts);
    for (const [num, m] of Object.entries(raw)) {
      map[num] = {
        description: m.description,
        imageUrls: m.images
          .map((img) => markingNumberImageUrl(img.recordId, img.filename))
          .filter(Boolean),
      };
    }
    return map;
  }, [dicts]);
  const materials = dicts?.materials.map((x) => x.name) ?? [];

  // Черновик = снимок смены при открытии; в PB/кэш пишем только по «Сохранить»
  const [date, setDate] = useState(shift.isoDate);
  const [participants, setParticipants] = useState<string[]>(() => [...shift.participants]);
  const [rows, setRows] = useState<EditDraftRow[]>(() =>
    shift.rows.map((r) => ({
      location: r.location,
      markingNum: r.markingNum,
      markingType: r.markingType,
      volume: String(r.volume),
      material: r.material,
      tariff: String(r.tariff),
    })),
  );
  const [saving, setSaving] = useState(false);

  function toggleParticipant(p: string) {
    setParticipants((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  function updateRow(i: number, patch: Partial<EditDraftRow>) {
    setRows((prev) => prev.map((r, idx) => {
      if (idx !== i) return r;
      const n = { ...r, ...patch };
      // Тип сбрасываем только если при смене № он больше не подходит к новому номеру
      if (patch.markingNum !== undefined && patch.markingNum !== r.markingNum) {
        const types = typeMap[patch.markingNum] || [];
        if (n.markingType && !types.includes(n.markingType)) n.markingType = "";
      }
      return n;
    }));
  }

  function addRow() {
    const last = rows[rows.length - 1];
    setRows((prev) => [...prev, {
      location: "",
      markingNum: "",
      markingType: "",
      volume: last?.volume ?? "",
      material: last?.material ?? "",
      tariff: last?.tariff ?? "",
    }]);
  }

  const canSave =
    !saving &&
    participants.length > 0 &&
    rows.length > 0 &&
    rows.every((r) => isShiftRowComplete(r, typeMap));

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      await updateShift(shift.id, {
        date: fromIsoDate(date),
        participants,
        rows: rows.map((r) => ({
          location: r.location,
          markingNum: r.markingNum,
          markingType: r.markingType,
          volume: parseFloat(r.volume) || 0,
          material: r.material,
          tariff: parseFloat(r.tariff) || 0,
        })),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle: CSSProperties = {
    width: "100%", height: 40, borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)",
    background: "rgba(255,255,255,0.9)", padding: "0 10px", fontSize: 13, color: "#111827",
    fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box",
  };

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "absolute", inset: 0, zIndex: 250, pointerEvents: "auto",
      background: "rgba(0,0,0,0.40)",
      display: "flex", alignItems: "flex-end",
    }}>
      <div style={{
        width: "100%", maxHeight: "92%", display: "flex", flexDirection: "column",
        background: "rgba(248,249,252,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: "24px 24px 0 0",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)",
        fontFamily: "Inter, sans-serif",
        animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
      }}>
        <style>{`@keyframes sheetUp { from { transform:translateY(100%); } to { transform:translateY(0); } }`}</style>
        <div style={{ padding: "14px 20px 10px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
            <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>Редактировать смену</span>
            <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", outline: "none", display: "flex" }}><X size={18} /></button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "4px 20px 20px", flex: 1, WebkitOverflowScrolling: "touch" }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>Дата</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...fieldStyle, marginBottom: 16 }} />

          <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Участники</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
            {participantOptions.map((p) => {
              const on = participants.includes(p);
              return (
                <button key={p} type="button" onClick={() => toggleParticipant(p)} style={{
                  padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: on ? "rgba(99,102,241,0.12)" : "rgba(0,0,0,0.04)",
                  color: on ? "#4f46e5" : "#6b7280", fontSize: 12, fontWeight: 500,
                  fontFamily: "Inter, sans-serif", outline: "none",
                }}>
                  {initials(p)}
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.04em" }}>Работы</div>
            <button type="button" onClick={addRow} style={{
              display: "flex", alignItems: "center", gap: 4, background: "none", border: "none",
              color: "#FF6B00", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif", outline: "none",
            }}>
              <Plus size={14} strokeWidth={2.5} /> Строка
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {rows.map((r, i) => {
              const types = typeMap[r.markingNum] || [];
              const pay = (parseFloat(r.volume) || 0) * (parseFloat(r.tariff) || 0);
              return (
                <div key={i} style={{
                  background: "rgba(255,255,255,0.85)", borderRadius: 14,
                  border: "1px solid rgba(0,0,0,0.06)", padding: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>Строка {i + 1}</span>
                    {rows.length > 1 && (
                      <button type="button" onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))} style={{
                        background: "none", border: "none", color: "#ef4444", fontSize: 11, cursor: "pointer", fontFamily: "Inter, sans-serif", outline: "none",
                      }}>Удалить</button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <EditFieldSelect
                      label="Место"
                      value={r.location}
                      options={locations}
                      withSearch
                      onChange={(v) => updateRow(i, { location: v })}
                    />
                    <EditFieldSelect
                      label="№ разметки"
                      value={r.markingNum}
                      options={markingNums}
                      withSearch
                      optionMeta={markingNumMeta}
                      onChange={(v) => updateRow(i, { markingNum: v })}
                    />
                    {types.length > 0 ? (
                      <EditFieldSelect
                        label="Тип"
                        value={r.markingType}
                        options={types}
                        onChange={(v) => updateRow(i, { markingType: v })}
                      />
                    ) : r.markingNum ? (
                      <div style={{
                        ...fieldStyle,
                        color: "#d1d5db",
                        background: "rgba(0,0,0,0.04)",
                        cursor: "default",
                        pointerEvents: "none",
                      }}>
                        —
                      </div>
                    ) : null}
                    <EditFieldSelect
                      label="Материал"
                      value={r.material}
                      options={materials}
                      onChange={(v) => updateRow(i, { material: v })}
                    />
                    <input type="number" min="0" inputMode="decimal" placeholder="Объём" value={r.volume} onChange={(e) => updateRow(i, { volume: e.target.value })} style={fieldStyle} />
                    <input type="number" min="0" inputMode="decimal" placeholder="Тариф" value={r.tariff} onChange={(e) => updateRow(i, { tariff: e.target.value })} style={fieldStyle} />
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: pay > 0 ? "#059669" : "#c4c9d4" }}>
                    Оплата: {pay > 0 ? fmt(pay) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{
          flexShrink: 0, display: "flex", gap: 10, padding: "12px 20px calc(16px + env(safe-area-inset-bottom))",
          borderTop: "1px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.92)",
        }}>
          <button type="button" onClick={onClose} style={{
            flex: 1, height: 46, borderRadius: 12, border: "1.5px solid rgba(0,0,0,0.10)",
            background: "transparent", fontSize: 14, color: "#6b7280", fontFamily: "Inter, sans-serif", cursor: "pointer",
          }}>Отменить</button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => { void handleSave(); }}
            style={{
              flex: 2, height: 46, borderRadius: 12, border: "none",
              background: canSave ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "rgba(0,0,0,0.08)",
              color: canSave ? "#fff" : "#c4c9d4",
              fontSize: 14, fontWeight: 600, fontFamily: "Inter, sans-serif",
              cursor: canSave ? "pointer" : "default",
              opacity: saving ? 0.7 : 1,
              boxShadow: canSave ? "0 4px 14px rgba(255,107,0,0.28)" : "none",
            }}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>,
    document.getElementById("app-portal")!,
  );
}

// ─── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({ shift, onRequestEdit, onRequestDelete }: {
  shift: Shift;
  onRequestEdit: (s: Shift) => void;
  onRequestDelete: (s: Shift) => void;
}) {
  const { phoneRef } = useOutletContext<ShellContext>();
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState(0);
  const [isSnapped, setIsSnapped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);
  const activePointerId = useRef<number | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const scrollTopAtStart = useRef(0);
  const dxRef = useRef(0);
  const skipToggle = useRef(false);

  const total = shiftTotal(shift);
  const pp = perPerson(shift);
  const totalVol = shift.rows.reduce((s, r) => s + r.volume, 0);
  const preview = shift.rows
    .map(r => `${r.markingNum}${r.markingType ? ` — ${r.markingType}` : ""} · ${fmtVol(r.volume)}`)
    .join("  ·  ");

  useEffect(() => {
    if (!menu) return;
    const el = phoneRef.current;
    if (!el) return;
    const close = () => setMenu(null);
    el.addEventListener("scroll", close, { passive: true });
    return () => el.removeEventListener("scroll", close);
  }, [menu, phoneRef]);

  function clearLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function openContextMenu(clientX: number, clientY: number) {
    const portal = document.getElementById("app-portal");
    if (!portal) return;
    const pb = portal.getBoundingClientRect();
    setMenu({ x: clientX - pb.left, y: clientY - pb.top });
  }

  function commitDelete() {
    if (removing) return;
    setRemoving(true);
    setIsSnapped(false);
    setDx(0);
    setMenu(null);
    setTimeout(() => { onRequestDelete(shift); }, 280);
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    directionLocked.current = null;
    activePointerId.current = e.pointerId;
    longPressFired.current = false;
    scrollTopAtStart.current = phoneRef.current?.scrollTop ?? 0;
    clearLongPress();
    const target = e.currentTarget as HTMLElement;
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      // Скролл списка уже начался — не открываем меню
      if ((phoneRef.current?.scrollTop ?? 0) !== scrollTopAtStart.current) return;
      if (!startPos.current || activePointerId.current !== e.pointerId) return;
      longPressFired.current = true;
      skipToggle.current = true;
      directionLocked.current = null;
      setDragging(false);
      setDx(0);
      dxRef.current = 0;
      if (!target.hasPointerCapture(e.pointerId)) {
        try { target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      }
      openContextMenu(startPos.current.x, startPos.current.y);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(12); } catch { /* ignore */ }
      }
    }, LONG_PRESS_MS);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (activePointerId.current !== e.pointerId || !startPos.current) return;
    if (longPressFired.current) return;

    const dxRaw = e.clientX - startPos.current.x;
    const dyRaw = e.clientY - startPos.current.y;
    const absDx = Math.abs(dxRaw);
    const absDy = Math.abs(dyRaw);

    // Мелкое дрожание не срывает hold; отмена только после явного сдвига
    if (longPressTimer.current && (absDx > LONG_PRESS_MOVE_PX || absDy > LONG_PRESS_MOVE_PX)) {
      clearLongPress();
    }

    if (!directionLocked.current && (absDx > DIRECTION_THRESHOLD || absDy > DIRECTION_THRESHOLD)) {
      directionLocked.current = absDx > absDy ? "horizontal" : "vertical";
      clearLongPress();
      if (directionLocked.current === "horizontal") setDragging(true);
    }

    if (directionLocked.current !== "horizontal") return;
    e.preventDefault();
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    const clamped = Math.min(0, Math.max(-SWIPE_SNAP - 24, dxRaw + (isSnapped ? -SWIPE_SNAP : 0)));
    dxRef.current = clamped;
    setDx(clamped);
  }

  function onPointerUp(e: React.PointerEvent) {
    if (activePointerId.current !== null && e.pointerId !== activePointerId.current) return;
    clearLongPress();
    const el = cardRef.current;
    if (el && e.pointerId != null && el.hasPointerCapture(e.pointerId)) {
      try { el.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (longPressFired.current) {
      // меню уже открыто
    } else if (directionLocked.current === "horizontal") {
      const committed = dxRef.current < -(SWIPE_SNAP / 2);
      setIsSnapped(committed);
      setDx(0);
      dxRef.current = 0;
    } else if (directionLocked.current === null && !skipToggle.current) {
      if (isSnapped) setIsSnapped(false);
      else setOpen((o) => !o);
    }
    skipToggle.current = false;
    setDragging(false);
    startPos.current = null;
    directionLocked.current = null;
    activePointerId.current = null;
  }

  const translateX = isSnapped ? -SWIPE_SNAP : dx;
  const deleteProgress = Math.min(1, Math.abs(translateX) / SWIPE_SNAP);

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      borderRadius: 18,
      maxHeight: removing ? 0 : 2000,
      opacity: removing ? 0 : 1,
      marginBottom: removing ? 0 : undefined,
      transform: removing ? "translateX(-24px) scale(0.96)" : "none",
      transition: removing
        ? "max-height 0.28s ease, opacity 0.24s ease, transform 0.24s ease, margin 0.28s ease"
        : "box-shadow 0.2s",
    }}>
      <div style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: SWIPE_SNAP,
        background: "linear-gradient(135deg,#ef4444,#dc2626)",
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: 18,
        opacity: deleteProgress,
        transform: `translateX(${(1 - deleteProgress) * 14}px) scale(${0.88 + 0.12 * deleteProgress})`,
        transition: dragging ? "none" : "opacity 0.22s ease, transform 0.22s ease",
        pointerEvents: deleteProgress > 0.45 ? "auto" : "none",
      }}>
        <button
          type="button"
          onClick={commitDelete}
          style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: "white", outline: "none", padding: 0 }}
        >
          <Trash2 size={18} strokeWidth={1.8} color="white" />
          <span style={{ fontSize: 10, fontWeight: 600, color: "white" }}>Удалить</span>
        </button>
      </div>

      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => {
          e.preventDefault();
          clearLongPress();
          skipToggle.current = true;
          openContextMenu(e.clientX, e.clientY);
        }}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: dragging ? "none" : "transform 0.28s cubic-bezier(0.34,1.56,0.64,1)",
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.65)",
          borderRadius: 18, overflow: "hidden",
          boxShadow: open ? "0 4px 20px rgba(0,0,0,0.10)" : "0 2px 10px rgba(0,0,0,0.05)",
          touchAction: "pan-y",
          userSelect: "none",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <div style={{
          width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
          padding: "14px 16px", textAlign: "left",
        }}>
          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em", lineHeight: 1 }}>
              {shift.date.slice(0, 2)}
            </span>
            <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500, letterSpacing: "0.01em" }}>
              {shift.date.slice(3, 5)}.{shift.date.slice(8)}
            </span>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {shift.participants.map(initials).join(", ")}
            </div>
            <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {preview}
            </div>
          </div>

          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#059669", letterSpacing: "-0.02em" }}>
              {fmt(pp)}
            </span>
            <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500 }}>на чел.</span>
            {open
              ? <ChevronUp size={14} strokeWidth={2} color="#9ca3af" />
              : <ChevronDown size={14} strokeWidth={2} color="#9ca3af" />
            }
          </div>
        </div>

        {open && (
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "12px 16px 16px", animation: "fadeUp 0.18s ease forwards" }}>
            <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }`}</style>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              {shift.rows.map((r, i) => (
                <div key={i} style={{ background: "rgba(0,0,0,0.025)", borderRadius: 10, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", letterSpacing: "-0.02em", marginBottom: 2 }}>
                      {r.markingNum}{r.markingType ? ` — ${r.markingType}` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af" }}>
                      {r.location ? `${r.location} · ` : ""}{r.material} · тариф {r.tariff} ₽/м²
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{fmtVol(r.volume)}</div>
                    <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>{fmt(r.volume * r.tariff)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: "rgba(0,0,0,0.06)", marginBottom: 12 }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div style={{ background: "rgba(5,150,105,0.07)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#059669", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>Итого сумма</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#059669", letterSpacing: "-0.03em" }}>{fmt(total)}</div>
              </div>
              <div style={{ background: "rgba(99,102,241,0.07)", borderRadius: 10, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>Объём</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#6366f1", letterSpacing: "-0.03em" }}>{fmtVol(totalVol)}</div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                Участники · {shift.participants.length} чел. · {fmt(pp)} / чел.
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {shift.participants.map(p => (
                  <div key={p} style={{ background: "rgba(0,0,0,0.05)", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: "#374151", fontWeight: 500 }}>
                    {initials(p)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onEdit={() => onRequestEdit(shift)}
          onDelete={commitDelete}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const cached = useShifts();
  const dicts = useDictionaries();
  const shifts = useMemo(() => cached.map(cachedToShift), [cached]);
  const participantOptions = useMemo(() => {
    const teammates = dicts?.participants.map((p) => p.name) ?? [];
    const base = buildParticipantOptions(teammates, getCurrentUserFullName());
    const set = new Set(base);
    for (const s of shifts) for (const p of s.participants) set.add(p);
    return [...set];
  }, [dicts, shifts]);

  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [showCal, setShowCal] = useState(false);
  const [calPos, setCalPos] = useState({ top: 0, left: 0 });
  const calBtnRef = useRef<HTMLButtonElement>(null);

  const [showFilter, setShowFilter] = useState(false);
  const [filterParticipants, setFilterParticipants] = useState<string[]>([]);
  const [editing, setEditing] = useState<Shift | null>(null);
  /** Soft-delete: id → true, пока на экране History; flush при уходе/закрытии. */
  const [pendingDeletes, setPendingDeletes] = useState<Record<string, true>>({});
  const pendingDeletesRef = useRef(pendingDeletes);
  pendingDeletesRef.current = pendingDeletes;

  useEffect(() => {
    function flush() {
      const ids = Object.keys(pendingDeletesRef.current);
      for (const id of ids) void removeShift(id);
      pendingDeletesRef.current = {};
    }
    const onPageHide = () => flush();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      flush();
    };
  }, []);

  const filtered = shifts.filter(s => {
    const inRange =
      (!dateRange.from || s.dateObj >= dateRange.from) &&
      (!dateRange.to || s.dateObj <= dateRange.to);
    const matchParticipants =
      filterParticipants.length === 0 ||
      filterParticipants.every(p => s.participants.includes(p));
    return inRange && matchParticipants;
  });

  const activeFiltered = filtered.filter((s) => !pendingDeletes[s.id]);

  const totalVol = activeFiltered.reduce((s, sh) => s + sh.rows.reduce((a, r) => a + r.volume, 0), 0);
  const totalPay = activeFiltered.reduce((s, sh) => s + shiftTotal(sh), 0);
  const totalPerPerson = activeFiltered.reduce((s, sh) => s + perPerson(sh), 0);

  function formatPeriod() {
    if (!dateRange.from && !dateRange.to) return "Весь период";
    const fmt2 = (d: Date) => `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (dateRange.from && dateRange.to) return `${fmt2(dateRange.from)} – ${fmt2(dateRange.to)}`;
    if (dateRange.from) return `с ${fmt2(dateRange.from)}`;
    return "";
  }

  function openCal() {
    const portal = document.getElementById("app-portal");
    if (!calBtnRef.current || !portal) return;
    const pb = portal.getBoundingClientRect();
    const bb = calBtnRef.current.getBoundingClientRect();
    setCalPos({ top: bb.bottom - pb.top + 6, left: bb.right - pb.left - 280 });
    setShowCal(true);
  }

  const hasFilter = filterParticipants.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", fontFamily: "Inter, sans-serif" }}>
      <div style={{ padding: "52px 20px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em" }}>История</h1>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setShowFilter(true)} style={{
              width: 36, height: 36, borderRadius: 12, border: "none", cursor: "pointer",
              background: hasFilter ? "rgba(99,102,241,0.12)" : "rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center", outline: "none",
              position: "relative",
            }}>
              <SlidersHorizontal size={16} strokeWidth={2} color={hasFilter ? "#6366f1" : "#6b7280"} />
              {hasFilter && (
                <div style={{ position: "absolute", top: 6, right: 6, width: 6, height: 6, borderRadius: "50%", background: "#6366f1" }} />
              )}
            </button>
            <button ref={calBtnRef} onClick={openCal} style={{
              height: 36, borderRadius: 12, border: "none", cursor: "pointer",
              background: (dateRange.from || dateRange.to) ? "rgba(255,107,0,0.10)" : "rgba(0,0,0,0.06)",
              display: "flex", alignItems: "center", gap: 6, padding: "0 12px", outline: "none",
            }}>
              <Calendar size={15} strokeWidth={2} color={(dateRange.from || dateRange.to) ? "#FF6B00" : "#6b7280"} />
              <span style={{ fontSize: 12, fontWeight: 500, color: (dateRange.from || dateRange.to) ? "#FF6B00" : "#6b7280", fontFamily: "Inter, sans-serif" }}>
                {formatPeriod()}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 110 }}>
        {filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 48, opacity: 0.5 }}>
            <Calendar size={36} strokeWidth={1.3} color="#9ca3af" />
            <p style={{ margin: 0, fontSize: 14, color: "#9ca3af", textAlign: "center" }}>Смены не найдены</p>
          </div>
        ) : (
          filtered.map(shift => (
            pendingDeletes[shift.id] ? (
              <RestorePlaceholder
                key={shift.id}
                onRestore={() => setPendingDeletes((prev) => {
                  const next = { ...prev };
                  delete next[shift.id];
                  return next;
                })}
              />
            ) : (
              <ShiftCard
                key={shift.id}
                shift={shift}
                onRequestEdit={setEditing}
                onRequestDelete={(s) => setPendingDeletes((prev) => ({ ...prev, [s.id]: true }))}
              />
            )
          ))
        )}

        <div style={{
          margin: "4px 0 0",
          background: "rgba(255,255,255,0.82)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.65)",
          borderRadius: 16, padding: "12px 16px",
          boxShadow: "0 -2px 20px rgba(0,0,0,0.06)",
        }}>
          <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
            Период: {formatPeriod()}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500, marginBottom: 2 }}>Всего объём</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#6366f1", letterSpacing: "-0.03em" }}>{fmtVol(totalVol)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500, marginBottom: 2 }}>Всего заработано</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#059669", letterSpacing: "-0.03em" }}>{fmt(totalPay)}</div>
              <div style={{ fontSize: 10, color: "#9ca3af" }}>на одного · {fmt(totalPerPerson)}</div>
            </div>
          </div>
        </div>
      </div>

      {showCal && (
        <MiniCalendar
          range={dateRange}
          onChange={setDateRange}
          onClose={() => setShowCal(false)}
          top={calPos.top}
          left={calPos.left}
        />
      )}

      {showFilter && (
        <FilterSheet
          selected={filterParticipants}
          onChange={setFilterParticipants}
          onClose={() => setShowFilter(false)}
          options={participantOptions}
        />
      )}

      {editing && (
        <EditShiftSheet
          shift={editing}
          participantOptions={participantOptions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
