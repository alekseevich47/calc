import { useState, useRef, useEffect, createContext, useContext, useMemo } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router";
import { Plus, Calendar, ChevronDown, X, Search, Check, Trash2 } from "lucide-react";
import { StatusBadge } from "../components/shared";
import { DEFAULT_DICTIONARIES, markingTypesMap } from "../lib/db";
import { getCurrentUserFullName } from "../lib/session";
import { confirmShift, peekSyncSnapshot, syncNow, useDictionaries, useSyncStatus } from "../lib/sync";
import type { QuickRow, ShellContext } from "./AppShell";

// ─── Dictionaries context (из IndexedDB / PocketBase) ─────────────────────────

type DictOptions = {
  locations: string[];
  markingNums: string[];
  markingTypes: Record<string, string[]>;
  materials: string[];
  participants: string[];
};

function toDictOptions(dicts: typeof DEFAULT_DICTIONARIES): DictOptions {
  return {
    locations: dicts.locations.map((x) => x.name),
    markingNums: dicts.markingNumbers.map((x) => x.number),
    markingTypes: markingTypesMap(dicts),
    materials: dicts.materials.map((x) => x.name),
    participants: dicts.participants.map((x) => x.name),
  };
}

const DictContext = createContext<DictOptions>(toDictOptions(DEFAULT_DICTIONARIES));
function useDict() { return useContext(DictContext); }

// ─── Participants ─────────────────────────────────────────────────────────────

function ParticipantsBlock({
  selected, setSelected,
}: { selected: string[]; setSelected: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const { participants: allParticipants } = useDict();

  useEffect(() => {
    const h = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (name: string) => setSelected(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <div ref={dropRef} style={{ position: "relative" }}>
        <button onClick={() => setOpen((v) => !v)} style={{
          width: "100%", height: 44, borderRadius: 12,
          background: "rgba(255,255,255,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${open ? "rgba(255,107,0,0.45)" : "rgba(0,0,0,0.09)"}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 14px", cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
          boxShadow: open ? "0 0 0 3px rgba(255,107,0,0.10)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
        }}>
          <span style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>Выбрано: {selected.length}</span>
          <ChevronDown size={16} strokeWidth={2} color="#9ca3af" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
        </button>
        {open && (
          <div style={{
            position: "absolute", bottom: "calc(100% + 6px)", left: 0, right: 0, zIndex: 30,
            background: "rgba(255,255,255,0.96)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(0,0,0,0.08)", borderRadius: 14,
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)", overflow: "hidden",
            animation: "fadeUp 0.15s ease forwards",
          }}>
            {allParticipants.map((name) => {
              const checked = selected.includes(name);
              return (
                <button key={name} onClick={() => toggle(name)} style={{
                  width: "100%", height: 42, padding: "0 14px", display: "flex", alignItems: "center", gap: 10,
                  background: checked ? "rgba(255,107,0,0.06)" : "transparent",
                  border: "none", borderBottom: "1px solid rgba(0,0,0,0.04)",
                  cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: checked ? "none" : "1.5px solid rgba(0,0,0,0.18)", background: checked ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </div>
                  <span style={{ fontSize: 13, color: "#111827", fontWeight: checked ? 500 : 400 }}>{name}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {selected.map((name) => (
          <div key={name} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 28, padding: "0 10px 0 12px", background: "rgba(255,107,0,0.10)", borderRadius: 999, border: "1px solid rgba(255,107,0,0.18)" }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: "#c2500a" }}>{name}</span>
            <button onClick={() => toggle(name)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", color: "#c2500a", outline: "none" }}>
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Table data & types ───────────────────────────────────────────────────────

type ColKey = "location" | "markingNum" | "markingType" | "volume" | "material" | "tariff";

interface FilledRow {
  id: number;
  location: string;
  markingNum: string;
  markingType: string;
  volume: number;
  material: string;
  tariff: number;
}

interface EditRow { location: string; markingNum: string; markingType: string; volume: string; material: string; tariff: string; }

const COL_DEFS: { key: ColKey | "payment"; short: string; width: number }[] = [
  { key: "location",    short: "Н.п. / трасса", width: 110 },
  { key: "markingNum",  short: "№ разм.",        width: 82  },
  { key: "markingType", short: "Тип",            width: 110 },
  { key: "volume",      short: "Объём",          width: 65  },
  { key: "material",    short: "Матер.",         width: 92  },
  { key: "tariff",      short: "Тариф",          width: 68  },
  { key: "payment",     short: "Оплата",         width: 76  },
];

function fmt(n: number) { return n.toLocaleString("ru-RU") + " ₽"; }

// ─── Swipeable row ────────────────────────────────────────────────────────────
// Direction locking: if first meaningful movement is more vertical than horizontal,
// the gesture is treated as a scroll and swipe-delete is not engaged.

const SWIPE_SNAP = 72;
const DIRECTION_THRESHOLD = 6; // px before we lock direction

function SwipeableRow({ row, onDelete, onEdit }: { row: FilledRow; onDelete: () => void; onEdit: () => void }) {
  const [dx, setDx] = useState(0);
  const [isSnapped, setIsSnapped] = useState(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const directionLocked = useRef<"horizontal" | "vertical" | null>(null);
  const activePointerId = useRef<number | null>(null);
  const payment = fmt(row.volume * row.tariff);

  // Whether delete zone is visually present
  const showDelete = dx < -4 || isSnapped;

  function onPointerDown(e: React.PointerEvent) {
    // Only primary button / single touch
    if (e.button !== 0 && e.pointerType === "mouse") return;
    startPos.current = { x: e.clientX, y: e.clientY };
    directionLocked.current = null;
    activePointerId.current = e.pointerId;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (activePointerId.current !== e.pointerId || !startPos.current) return;
    const dxRaw = e.clientX - startPos.current.x;
    const dyRaw = e.clientY - startPos.current.y;
    const absDx = Math.abs(dxRaw);
    const absDy = Math.abs(dyRaw);

    // Lock direction once movement exceeds threshold
    if (!directionLocked.current && (absDx > DIRECTION_THRESHOLD || absDy > DIRECTION_THRESHOLD)) {
      directionLocked.current = absDx > absDy ? "horizontal" : "vertical";
    }

    if (directionLocked.current !== "horizontal") return;

    // Prevent scroll when we've taken over
    e.preventDefault();
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    const clamped = Math.min(0, dxRaw + (isSnapped ? -SWIPE_SNAP : 0));
    setDx(clamped);
  }

  function onPointerUp() {
    if (directionLocked.current === "horizontal") {
      const committed = dx < -(SWIPE_SNAP / 2);
      setIsSnapped(committed);
      setDx(0);
    } else if (directionLocked.current === null) {
      // No movement — treat as a tap
      if (isSnapped) {
        setIsSnapped(false); // close delete zone on tap
      } else {
        onEdit();
      }
    }
    startPos.current = null;
    directionLocked.current = null;
    activePointerId.current = null;
  }

  const translateX = isSnapped ? -SWIPE_SNAP : dx;

  return (
    <div style={{ position: "relative", overflow: "hidden", borderBottom: "1px solid rgba(0,0,0,0.055)" }}>
      {/* Delete zone — only rendered during/after swipe */}
      {showDelete && (
        <div style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: SWIPE_SNAP,
          background: "linear-gradient(135deg,#ef4444,#dc2626)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: Math.min(1, Math.abs(translateX) / SWIPE_SNAP),
          transition: "opacity 0.1s",
        }}>
          <button onClick={() => { setIsSnapped(false); setDx(0); onDelete(); }} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: "white", outline: "none", padding: 0 }}>
            <Trash2 size={16} strokeWidth={1.8} color="white" />
            <span style={{ fontSize: 10, fontWeight: 600, color: "white" }}>Удалить</span>
          </button>
        </div>
      )}

      {/* Row content */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: (directionLocked.current === "horizontal") ? "none" : "transform 0.28s cubic-bezier(0.34,1.56,0.64,1)",
          background: "rgba(255,255,255,0.90)",
          userSelect: "none",
          // Allow native vertical scroll and horizontal table scroll to work when not in swipe mode
          touchAction: "pan-y",
        }}
      >
        <table style={{ borderCollapse: "collapse", minWidth: 610, tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: 28 }} />
            {COL_DEFS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <tbody>
            <tr>
              <td style={{ padding: "10px 4px 10px 10px", verticalAlign: "middle" }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#d1d5db", margin: "0 auto" }} />
              </td>
              {/* location — wraps to two lines for long names */}
              <td style={{ padding: "10px 8px", fontSize: 12, color: "#374151", fontWeight: 500, verticalAlign: "middle", whiteSpace: "normal", lineHeight: 1.35, wordBreak: "break-word" }}>
                {row.location}
              </td>
              <td style={{ padding: "10px 8px", fontSize: 12, color: "#111827", fontWeight: 600, verticalAlign: "middle", whiteSpace: "nowrap" }}>{row.markingNum}</td>
              <td style={{ padding: "10px 8px", fontSize: 11, color: "#6b7280", fontWeight: 400, verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.markingType}</td>
              <td style={{ padding: "10px 8px", fontSize: 12, color: "#374151", fontWeight: 500, verticalAlign: "middle", whiteSpace: "nowrap" }}>{row.volume} м²</td>
              <td style={{ padding: "10px 8px", fontSize: 11, color: "#6b7280", fontWeight: 400, verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.material}</td>
              <td style={{ padding: "10px 8px", fontSize: 12, color: "#374151", fontWeight: 400, verticalAlign: "middle", whiteSpace: "nowrap" }}>{row.tariff} ₽</td>
              <td style={{ padding: "10px 8px", fontSize: 12, color: "#059669", fontWeight: 700, verticalAlign: "middle", whiteSpace: "nowrap" }}>{payment}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Dropdown card ────────────────────────────────────────────────────────────

function DropdownCard({ options, value, onSelect, onClose, withSearch, top, left, width, step }: {
  options: string[]; value: string; onSelect: (v: string) => void; onClose: () => void;
  withSearch: boolean; top: number; left: number; width: number; step: number;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Не фокусируем поиск автоматически — иначе на mobile сразу открывается клавиатура.
    const h = (e: MouseEvent) => {
      const el = document.getElementById("dd-card");
      if (el && !el.contains(e.target as Node)) onClose();
    };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  return (
    <div id="dd-card" style={{
      position: "absolute", top, left, width, pointerEvents: "auto", zIndex: 100,
      background: "rgba(255,255,255,0.97)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      border: "1px solid rgba(0,0,0,0.09)", borderRadius: 16,
      boxShadow: "0 16px 48px rgba(0,0,0,0.16), 0 2px 8px rgba(0,0,0,0.06)",
      overflow: "hidden", animation: "fadeUp 0.18s cubic-bezier(0.22,1,0.36,1) forwards",
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: withSearch ? 8 : 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#FF6B00", letterSpacing: "0.04em", textTransform: "uppercase" }}>Шаг {step}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "#9ca3af", display: "flex", outline: "none" }}><X size={14} strokeWidth={2} /></button>
        </div>
        {withSearch && (
          <div style={{ position: "relative" }}>
            <Search size={13} strokeWidth={2} color="#9ca3af" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => { /* клавиатура только по тапу в поиск */ }}
              placeholder="Поиск..."
              inputMode="search"
              style={{ width: "100%", height: 32, borderRadius: 8, border: "1px solid rgba(0,0,0,0.09)", background: "rgba(0,0,0,0.03)", padding: "0 10px 0 28px", fontSize: 13, color: "#111827", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box" }}
            />
          </div>
        )}
      </div>
      <div style={{ maxHeight: 200, overflowY: "auto" }}>
        {filtered.map((opt) => {
          const isSel = value === opt;
          return (
            <button key={opt} onClick={() => { onSelect(opt); onClose(); }} style={{
              width: "100%", minHeight: 40, padding: "0 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: isSel ? "rgba(255,107,0,0.07)" : "transparent",
              border: "none", borderBottom: "1px solid rgba(0,0,0,0.04)",
              cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
            }}>
              <span style={{ fontSize: 13, color: isSel ? "#c2500a" : "#111827", fontWeight: isSel ? 600 : 400 }}>{opt}</span>
              {isSel && <Check size={14} strokeWidth={2.5} color="#FF6B00" />}
            </button>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 14, textAlign: "center", fontSize: 13, color: "#9ca3af" }}>Нет совпадений</div>}
      </div>
    </div>
  );
}

// ─── New-row edit form ────────────────────────────────────────────────────────

function NewRowForm({ phoneRef, scrollRef, onAdd, onCancel }: {
  phoneRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onAdd: (row: Omit<FilledRow, "id">) => void;
  onCancel: () => void;
}) {
  const [row, setRow] = useState<EditRow>({ location: "", markingNum: "", markingType: "", volume: "", material: "", tariff: "" });
  const [openCol, setOpenCol] = useState<ColKey | null>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 240 });
  const [barWidth, setBarWidth] = useState<number | undefined>();
  const dict = useDict();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setBarWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  const markingTypeAvailable = !!row.markingNum;
  const typeOptions = dict.markingTypes[row.markingNum] || [];

  function getOptions(col: ColKey): string[] {
    if (col === "location") return dict.locations;
    if (col === "markingNum") return dict.markingNums;
    if (col === "markingType") return typeOptions;
    if (col === "material") return dict.materials;
    return [];
  }

  function openDrop(col: ColKey, td: HTMLTableCellElement | null) {
    if (!td || !phoneRef.current) return;
    const pb = phoneRef.current.getBoundingClientRect();
    const tb = td.getBoundingClientRect();
    const ddW = 240;
    let left = tb.left - pb.left;
    if (left + ddW > pb.width - 8) left = pb.width - ddW - 8;
    if (left < 8) left = 8;
    setDropPos({ top: tb.bottom - pb.top + 4, left, width: ddW });
    setOpenCol(col);
  }

  function setVal(col: ColKey, val: string) {
    setRow((p) => { const n = { ...p, [col]: val }; if (col === "markingNum") n.markingType = ""; return n; });
  }

  const vol = parseFloat(row.volume) || 0;
  const tar = parseFloat(row.tariff) || 0;
  const payment = vol * tar > 0 ? fmt(vol * tar) : "0 ₽";

  const isDropdownCol = (c: ColKey | null): c is ColKey =>
    c !== null && ["location", "markingNum", "markingType", "material"].includes(c);

  const EDITABLE_COLS: { key: ColKey; locked?: boolean }[] = [
    { key: "location" },
    { key: "markingNum" },
    { key: "markingType", locked: !markingTypeAvailable },
    { key: "volume" },
    { key: "material" },
    { key: "tariff" },
  ];

  function handleAdd() {
    onAdd({
      location: row.location, markingNum: row.markingNum, markingType: row.markingType,
      volume: vol, material: row.material, tariff: tar,
    });
  }

  return (
    <>
      <table style={{ borderCollapse: "collapse", minWidth: 610, tableLayout: "fixed", width: "100%", borderTop: "1.5px solid rgba(255,107,0,0.2)" }}>
        <colgroup>
          <col style={{ width: 28 }} />
          {COL_DEFS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
        </colgroup>
        <tbody>
          <tr>
            <td style={{ padding: "8px 4px 8px 8px", verticalAlign: "middle" }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: "linear-gradient(135deg,#FF6B00,#FF9A00)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Plus size={12} strokeWidth={2.8} color="white" />
              </div>
            </td>
            {EDITABLE_COLS.map(({ key: col, locked }) => {
              const isNumeric = col === "volume" || col === "tariff";
              const isOpen = openCol === col;
              if (isNumeric) {
                return (
                  <td key={col} style={{ padding: "4px 6px", verticalAlign: "middle", background: "rgba(255,107,0,0.03)", borderBottom: "1.5px solid rgba(255,107,0,0.25)" }}>
                    <input type="number" min="0" inputMode="decimal" placeholder={col === "tariff" ? "0 ₽" : "0"} value={(row as any)[col]} onChange={(e) => setVal(col, e.target.value)}
                      style={{ width: "100%", height: 28, borderRadius: 6, border: "1px solid rgba(0,0,0,0.10)", background: "rgba(255,255,255,0.8)", padding: "0 6px", fontSize: 12, color: "#111827", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box" }} />
                  </td>
                );
              }
              return (
                <td key={col} onClick={(e) => { if (!locked) openDrop(col, e.currentTarget); }} style={{
                  padding: "8px 8px", verticalAlign: "middle", cursor: locked ? "not-allowed" : "pointer",
                  background: isOpen ? "rgba(255,107,0,0.10)" : locked ? "rgba(0,0,0,0.015)" : "rgba(255,107,0,0.03)",
                  borderBottom: "1.5px solid rgba(255,107,0,0.25)",
                  outline: isOpen ? "2px solid rgba(255,107,0,0.55)" : "none", outlineOffset: -1,
                }}>
                  {locked ? (
                    <span style={{ fontSize: 12, color: "#d1d5db", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="7" rx="1.5" stroke="#d1d5db" strokeWidth="1.3" /><path d="M3 5V3.5a2 2 0 1 1 4 0V5" stroke="#d1d5db" strokeWidth="1.3" strokeLinecap="round" /></svg>—
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: (row as any)[col] ? "#111827" : "#a5a5b0", fontWeight: (row as any)[col] ? 500 : 400 }}>
                      {(row as any)[col] || "Выбрать..."}
                    </span>
                  )}
                </td>
              );
            })}
            <td style={{ padding: "8px 8px", verticalAlign: "middle", background: "rgba(0,0,0,0.018)", borderBottom: "1.5px solid rgba(255,107,0,0.25)" }}>
              <span style={{ fontSize: 12, fontWeight: payment !== "0 ₽" ? 600 : 400, color: payment !== "0 ₽" ? "#059669" : "#c4c9d4", whiteSpace: "nowrap" }}>{payment}</span>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{
        position: "sticky", left: 0, zIndex: 2,
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "8px 12px",
        width: barWidth ?? "100%", boxSizing: "border-box",
        background: "rgba(255,255,255,0.94)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        borderTop: "1px solid rgba(0,0,0,0.04)",
      }}>
        <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", flex: 1, minWidth: 0 }}>Заполните поля строки</p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleAdd}
            style={{ fontSize: 12, fontWeight: 600, color: "#FF6B00", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif", outline: "none" }}
          >
            Добавить
          </button>
          <button type="button" onClick={onCancel} style={{ fontSize: 11, color: "#d1d5db", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif", outline: "none" }}>Отмена</button>
        </div>
      </div>
      {isDropdownCol(openCol) && (() => {
        const portal = document.getElementById("app-portal");
        if (!portal) return null;
        return createPortal(
          <DropdownCard
            options={getOptions(openCol)} value={(row as any)[openCol]}
            onSelect={(v) => setVal(openCol, v)} onClose={() => setOpenCol(null)}
            withSearch={openCol === "location" || openCol === "markingNum"}
            top={dropPos.top} left={dropPos.left} width={dropPos.width}
            step={(["location","markingNum","markingType","volume","material","tariff"] as ColKey[]).indexOf(openCol) + 1}
          />, portal,
        );
      })()}
    </>
  );
}

// ─── Edit Row Form ────────────────────────────────────────────────────────────
// Same layout as NewRowForm but pre-filled; saves changes to existing row.

function EditRowForm({ phoneRef, scrollRef, row, onSave, onCancel }: {
  phoneRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  row: FilledRow;
  onSave: (updated: Omit<FilledRow, "id">) => void;
  onCancel: () => void;
}) {
  const [editRow, setEditRow] = useState<EditRow>({
    location:    row.location,
    markingNum:  row.markingNum,
    markingType: row.markingType,
    volume:      String(row.volume),
    material:    row.material,
    tariff:      String(row.tariff),
  });
  const [openCol, setOpenCol] = useState<ColKey | null>(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 240 });
  const [barWidth, setBarWidth] = useState<number | undefined>();
  const dict = useDict();

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setBarWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef]);

  const markingTypeAvailable = !!editRow.markingNum;
  const typeOptions = dict.markingTypes[editRow.markingNum] || [];

  function getOptions(col: ColKey): string[] {
    if (col === "location") return dict.locations;
    if (col === "markingNum") return dict.markingNums;
    if (col === "markingType") return typeOptions;
    if (col === "material") return dict.materials;
    return [];
  }

  function openDrop(col: ColKey, td: HTMLTableCellElement | null) {
    if (!td || !phoneRef.current) return;
    const pb = phoneRef.current.getBoundingClientRect();
    const tb = td.getBoundingClientRect();
    const ddW = 240;
    let left = tb.left - pb.left;
    if (left + ddW > pb.width - 8) left = pb.width - ddW - 8;
    if (left < 8) left = 8;
    setDropPos({ top: tb.bottom - pb.top + 4, left, width: ddW });
    setOpenCol(col);
  }

  function setVal(col: ColKey, val: string) {
    setEditRow((p) => { const n = { ...p, [col]: val }; if (col === "markingNum") n.markingType = ""; return n; });
  }

  const vol = parseFloat(editRow.volume) || 0;
  const tar = parseFloat(editRow.tariff) || 0;
  const payment = vol * tar > 0 ? fmt(vol * tar) : "0 ₽";

  const isDropdownCol = (c: ColKey | null): c is ColKey =>
    c !== null && ["location", "markingNum", "markingType", "material"].includes(c);

  const EDITABLE_COLS: { key: ColKey; locked?: boolean }[] = [
    { key: "location" },
    { key: "markingNum" },
    { key: "markingType", locked: !markingTypeAvailable },
    { key: "volume" },
    { key: "material" },
    { key: "tariff" },
  ];

  return (
    <>
      <table style={{ borderCollapse: "collapse", minWidth: 610, tableLayout: "fixed", width: "100%", borderTop: "1.5px solid rgba(99,102,241,0.25)", background: "rgba(99,102,241,0.03)" }}>
        <colgroup>
          <col style={{ width: 28 }} />
          {COL_DEFS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
        </colgroup>
        <tbody>
          <tr>
            <td style={{ padding: "8px 4px 8px 8px", verticalAlign: "middle" }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: "linear-gradient(135deg,#6366f1,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 9L9 1M1 1l8 8" stroke="none"/><path d="M7.5 1H9v1.5M1 7.5V9h1.5M9 3v4M3 1h4M1 3v4M3 9h4" stroke="none"/><path d="M1.5 1.5l7 7M1.5 8.5l7-7" stroke="white" strokeWidth="1.6" strokeLinecap="round"/></svg>
              </div>
            </td>
            {EDITABLE_COLS.map(({ key: col, locked }) => {
              const isNumeric = col === "volume" || col === "tariff";
              const isOpen = openCol === col;
              if (isNumeric) {
                return (
                  <td key={col} style={{ padding: "4px 6px", verticalAlign: "middle", background: "rgba(99,102,241,0.04)", borderBottom: "1.5px solid rgba(99,102,241,0.20)" }}>
                    <input type="number" min="0" inputMode="decimal" value={(editRow as any)[col]} onChange={(e) => setVal(col, e.target.value)}
                      style={{ width: "100%", height: 28, borderRadius: 6, border: "1px solid rgba(0,0,0,0.10)", background: "rgba(255,255,255,0.9)", padding: "0 6px", fontSize: 12, color: "#111827", fontFamily: "Inter, sans-serif", outline: "none", boxSizing: "border-box" }} />
                  </td>
                );
              }
              return (
                <td key={col} onClick={(e) => { if (!locked) openDrop(col, e.currentTarget); }} style={{
                  padding: "8px 8px", verticalAlign: "middle", cursor: locked ? "not-allowed" : "pointer",
                  background: isOpen ? "rgba(99,102,241,0.10)" : locked ? "rgba(0,0,0,0.015)" : "rgba(99,102,241,0.04)",
                  borderBottom: "1.5px solid rgba(99,102,241,0.20)",
                  outline: isOpen ? "2px solid rgba(99,102,241,0.45)" : "none", outlineOffset: -1,
                }}>
                  {locked ? (
                    <span style={{ fontSize: 12, color: "#d1d5db", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width="10" height="12" viewBox="0 0 10 12" fill="none"><rect x="1" y="5" width="8" height="7" rx="1.5" stroke="#d1d5db" strokeWidth="1.3"/><path d="M3 5V3.5a2 2 0 1 1 4 0V5" stroke="#d1d5db" strokeWidth="1.3" strokeLinecap="round"/></svg>—
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: (editRow as any)[col] ? "#111827" : "#a5a5b0", fontWeight: (editRow as any)[col] ? 500 : 400 }}>
                      {(editRow as any)[col] || "Выбрать..."}
                    </span>
                  )}
                </td>
              );
            })}
            <td style={{ padding: "8px 8px", verticalAlign: "middle", background: "rgba(0,0,0,0.018)", borderBottom: "1.5px solid rgba(99,102,241,0.20)" }}>
              <span style={{ fontSize: 12, fontWeight: payment !== "0 ₽" ? 600 : 400, color: payment !== "0 ₽" ? "#059669" : "#c4c9d4", whiteSpace: "nowrap" }}>{payment}</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{
        position: "sticky", left: 0, zIndex: 2,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "8px 12px",
        width: barWidth ?? "100%", boxSizing: "border-box",
        background: "rgba(255,255,255,0.94)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
        borderTop: "1px solid rgba(99,102,241,0.08)",
      }}>
        <button
          onClick={() => onSave({ location: editRow.location, markingNum: editRow.markingNum, markingType: editRow.markingType, volume: vol, material: editRow.material, tariff: tar })}
          style={{ fontSize: 12, fontWeight: 600, color: "#6366f1", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif", outline: "none" }}
        >
          Сохранить
        </button>
        <button onClick={onCancel} style={{ fontSize: 11, color: "#d1d5db", background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif", outline: "none" }}>Отмена</button>
      </div>

      {isDropdownCol(openCol) && (() => {
        const portal = document.getElementById("app-portal");
        if (!portal) return null;
        return createPortal(
          <DropdownCard
            options={getOptions(openCol)} value={(editRow as any)[openCol]}
            onSelect={(v) => setVal(openCol, v)} onClose={() => setOpenCol(null)}
            withSearch={openCol === "location" || openCol === "markingNum"}
            top={dropPos.top} left={dropPos.left} width={dropPos.width}
            step={(["location","markingNum","markingType","volume","material","tariff"] as ColKey[]).indexOf(openCol) + 1}
          />, portal,
        );
      })()}
    </>
  );
}

// ─── Work Table ───────────────────────────────────────────────────────────────

function WorkTable({ rows, setRows, phoneRef }: {
  rows: FilledRow[];
  setRows: React.Dispatch<React.SetStateAction<FilledRow[]>>;
  phoneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function addRow(data: Omit<FilledRow, "id">) {
    setRows((p) => [...p, { ...data, id: Date.now() }]);
    setAdding(false);
  }

  function saveRow(id: number, data: Omit<FilledRow, "id">) {
    setRows((p) => p.map((r) => r.id === id ? { ...data, id } : r));
    setEditingId(null);
  }

  return (
    <div>
      <div ref={scrollRef} style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ borderCollapse: "collapse", minWidth: 610, tableLayout: "fixed", width: "100%" }}>
          <colgroup>
            <col style={{ width: 28 }} />
            {COL_DEFS.map((c) => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              {COL_DEFS.map((c) => (
                <th key={c.key} style={{ padding: "7px 8px", fontSize: 10, fontWeight: 600, color: "#9ca3af", textAlign: "left", letterSpacing: "0.03em", textTransform: "uppercase", whiteSpace: "nowrap", borderBottom: "1.5px solid rgba(0,0,0,0.08)" }}>
                  {c.short}
                </th>
              ))}
            </tr>
          </thead>
        </table>

        {rows.map((row) =>
          editingId === row.id ? (
            <EditRowForm
              key={row.id}
              phoneRef={phoneRef}
              scrollRef={scrollRef}
              row={row}
              onSave={(data) => saveRow(row.id, data)}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <SwipeableRow
              key={row.id}
              row={row}
              onDelete={() => setRows((p) => p.filter((r) => r.id !== row.id))}
              onEdit={() => { setAdding(false); setEditingId(row.id); }}
            />
          )
        )}

        {adding && <NewRowForm phoneRef={phoneRef} scrollRef={scrollRef} onAdd={addRow} onCancel={() => setAdding(false)} />}

        {!adding && !editingId && (
          <div onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 10px", cursor: "pointer", borderTop: "1px dashed #e5e7eb", position: "sticky", left: 0, width: "max(100%, 0px)" }}>
            <div style={{ width: 20, height: 20, borderRadius: 6, border: "1.5px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center", color: "#d1d5db", flexShrink: 0 }}>
              <Plus size={11} strokeWidth={2.5} />
            </div>
            <span style={{ fontSize: 12, color: "#c4c9d4", fontStyle: "italic" }}>Добавить строку...</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Confirm Bottom Sheet ─────────────────────────────────────────────────────

function ConfirmSheet({ rows, participants, date, onClose, onSave }: {
  rows: FilledRow[];
  participants: string[];
  date: Date;
  onClose: () => void;
  onSave: () => void;
}) {
  const totalPayment = rows.reduce((s, r) => s + r.volume * r.tariff, 0);
  const totalVolume  = rows.reduce((s, r) => s + r.volume, 0);
  const perPerson    = participants.length > 0 ? Math.round(totalPayment / participants.length) : 0;

  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();

  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on backdrop tap
  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const portalTarget = document.getElementById("app-portal") ?? document.body;
  const portalW = portalTarget.getBoundingClientRect?.().width ?? 0;
  const isCentered = portalTarget === document.body || portalW >= 900;

  return createPortal(
    <div
      onClick={onBackdropClick}
      style={{
        position: portalTarget === document.body ? "fixed" : "absolute", inset: 0,
        zIndex: portalTarget === document.body ? 1000 : 200, pointerEvents: "auto",
        background: "rgba(0,0,0,0.35)",
        display: "flex", alignItems: isCentered ? "center" : "flex-end",
        justifyContent: isCentered ? "center" : undefined,
        animation: "fadeInBd 0.2s ease forwards",
      }}
    >
      <style>{`
        @keyframes fadeInBd { from { opacity:0; } to { opacity:1; } }
        @keyframes slideUp  { from { transform:translateY(100%); } to { transform:translateY(0); } }
      `}</style>

      <div ref={sheetRef} style={{
        width: isCentered ? 560 : "100%",
        height: isCentered ? "auto" : "85%",
        maxHeight: isCentered ? "85vh" : undefined,
        background: "rgba(248,249,252,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: isCentered ? 24 : "24px 24px 0 0",
        boxShadow: isCentered ? "0 24px 80px rgba(0,0,0,0.20)" : "0 -8px 40px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        animation: "slideUp 0.32s cubic-bezier(0.22,1,0.36,1) forwards",
        fontFamily: "Inter, sans-serif",
        overflow: "hidden",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
        </div>

        {/* Header */}
        <div style={{ padding: "4px 20px 14px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>
              Проверьте данные смены
            </h2>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af", outline: "none", display: "flex" }}>
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#9ca3af", fontWeight: 400 }}>
            {`${dd}.${mm}.${yyyy}`}
          </p>
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* Work cards */}
          {rows.map((row, i) => (
            <div key={row.id} style={{
              background: "#fff", borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.07)",
              boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
              padding: "12px 14px",
            }}>
              {/* Card header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.04em", textTransform: "uppercase" }}>Строка {i + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#059669", letterSpacing: "-0.02em" }}>{fmt(row.volume * row.tariff)}</span>
              </div>
              {/* Fields grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px" }}>
                {[
                  { label: "Н.п. / трасса", value: row.location },
                  { label: "№ разметки",    value: row.markingNum },
                  { label: "Тип",           value: row.markingType },
                  { label: "Материал",      value: row.material },
                  { label: "Объём",         value: `${row.volume} м²` },
                  { label: "Тариф",         value: `${row.tariff} ₽/м²` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.03em", textTransform: "uppercase" }}>{label}</p>
                    <p style={{ margin: "1px 0 0", fontSize: 13, fontWeight: 500, color: "#111827" }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Summary block */}
          <div style={{
            background: "#fff", borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.07)",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
            overflow: "hidden", marginTop: 4,
          }}>
            {[
              { label: "Всего объём",      value: `${totalVolume} м²`,         accent: false },
              { label: "Всего заработано", value: fmt(totalPayment),            accent: true  },
              { label: "Участники",        value: participants.join(", "),      accent: false, small: true },
              { label: "На человека",      value: fmt(perPerson),               accent: true  },
            ].map(({ label, value, accent, small }, i, arr) => (
              <div key={label} style={{
                display: "flex", alignItems: "flex-start", justifyContent: "space-between",
                padding: "11px 14px",
                borderBottom: i < arr.length - 1 ? "1px solid rgba(0,0,0,0.05)" : "none",
              }}>
                <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 400, flexShrink: 0 }}>{label}</span>
                <span style={{
                  fontSize: small ? 12 : 14,
                  fontWeight: accent ? 700 : 500,
                  color: accent ? "#059669" : "#111827",
                  textAlign: "right", maxWidth: "55%",
                  letterSpacing: accent ? "-0.02em" : "normal",
                }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "12px 16px 20px", borderTop: "1px solid rgba(0,0,0,0.07)", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
          <button onClick={onSave} style={{
            width: "100%", height: 50, borderRadius: 14, border: "none",
            background: "linear-gradient(135deg,#FF6B00,#FF9A00)",
            color: "#fff", fontSize: 15, fontWeight: 600,
            fontFamily: "Inter, sans-serif", letterSpacing: "-0.01em",
            cursor: "pointer", outline: "none",
            boxShadow: "0 6px 20px rgba(255,107,0,0.28)",
          }}>
            Сохранить смену
          </button>
          <button onClick={onClose} style={{
            width: "100%", height: 46, borderRadius: 14,
            border: "1px solid rgba(0,0,0,0.10)",
            background: "rgba(255,255,255,0.8)",
            color: "#374151", fontSize: 14, fontWeight: 500,
            fontFamily: "Inter, sans-serif",
            cursor: "pointer", outline: "none",
          }}>
            Назад
          </button>
        </div>
      </div>
    </div>,
    portalTarget,
  );
}

// ─── Date Chip ────────────────────────────────────────────────────────────────

const RU_MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const RU_DOW = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function DateChip({ selected, setSelected, portalTarget }: { selected: Date; setSelected: (d: Date) => void; portalTarget: HTMLElement | null }) {
  const [viewYear, setViewYear] = useState(selected.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected.getMonth());
  const [open, setOpen] = useState(false);
  const chipRef = useRef<HTMLButtonElement>(null);
  const [calPos, setCalPos] = useState({ top: 0, left: 0 });

  function openCalendar() {
    if (!chipRef.current || !portalTarget) return;
    const pb = portalTarget.getBoundingClientRect();
    const cb = chipRef.current.getBoundingClientRect();
    const calW = 260;
    let left = cb.right - pb.left - calW;
    if (left < 8) left = 8;
    setCalPos({ top: cb.bottom - pb.top + 6, left });
    setViewYear(selected.getFullYear()); setViewMonth(selected.getMonth());
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const cal = document.getElementById("date-cal");
      if (cal && !cal.contains(e.target as Node) && !chipRef.current?.contains(e.target as Node)) setOpen(false);
    };
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function buildDays(y: number, m: number) {
    const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
    const startDow = (first.getDay() + 6) % 7;
    const days: (number | null)[] = Array(startDow).fill(null);
    for (let d = 1; d <= last.getDate(); d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }

  const days = buildDays(viewYear, viewMonth);
  const today = new Date();
  const isSel = (d: number) => selected.getFullYear() === viewYear && selected.getMonth() === viewMonth && selected.getDate() === d;
  const isToday = (d: number) => today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
  const prevM = () => viewMonth === 0 ? (setViewMonth(11), setViewYear(v => v - 1)) : setViewMonth(v => v - 1);
  const nextM = () => viewMonth === 11 ? (setViewMonth(0), setViewYear(v => v + 1)) : setViewMonth(v => v + 1);
  const dd = String(selected.getDate()).padStart(2, "0");
  const mm = String(selected.getMonth() + 1).padStart(2, "0");

  const calendar = open && portalTarget ? createPortal(
    <div id="date-cal" style={{ position: "absolute", top: calPos.top, left: calPos.left, width: 260, zIndex: 100, pointerEvents: "auto", background: "rgba(255,255,255,0.97)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", border: "1px solid rgba(0,0,0,0.09)", borderRadius: 16, boxShadow: "0 16px 48px rgba(0,0,0,0.16)", fontFamily: "Inter, sans-serif", animation: "fadeUp 0.18s cubic-bezier(0.22,1,0.36,1) forwards", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px 8px" }}>
        <button onClick={prevM} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6b7280", outline: "none", display: "flex" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{RU_MONTHS[viewMonth]} {viewYear}</span>
        <button onClick={nextM} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#6b7280", outline: "none", display: "flex" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px 4px" }}>
        {RU_DOW.map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.03em", padding: "2px 0" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px 12px", gap: 2 }}>
        {days.map((d, i) => {
          if (!d) return <div key={i} />;
          const sel = isSel(d), tod = isToday(d), isSat = i % 7 === 5, isSun = i % 7 === 6;
          return (
            <button key={i} onClick={() => { setSelected(new Date(viewYear, viewMonth, d)); setOpen(false); }} style={{ height: 30, borderRadius: 8, border: "none", background: sel ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "transparent", color: sel ? "#fff" : tod ? "#FF6B00" : isSat || isSun ? "#ef4444" : "#111827", fontSize: 12, fontWeight: sel || tod ? 600 : 400, cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif", boxShadow: sel ? "0 2px 8px rgba(255,107,0,0.3)" : "none", position: "relative" }}>
              {d}
              {tod && !sel && <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: "#FF6B00", display: "block" }} />}
            </button>
          );
        })}
      </div>
    </div>,
    portalTarget,
  ) : null;

  return (
    <>
      <button ref={chipRef} onClick={() => open ? setOpen(false) : openCalendar()} style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px 0 10px", background: open ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${open ? "rgba(255,107,0,0.45)" : "rgba(0,0,0,0.09)"}`, borderRadius: 10, boxShadow: open ? "0 0 0 3px rgba(255,107,0,0.10), 0 1px 4px rgba(0,0,0,0.06)" : "0 1px 4px rgba(0,0,0,0.06)", cursor: "pointer", fontFamily: "Inter, sans-serif", outline: "none", transition: "border-color 0.15s, box-shadow 0.15s", WebkitTapHighlightColor: "transparent" }}>
        <Calendar size={14} strokeWidth={2} color="#FF6B00" />
        <span style={{ fontSize: 13, fontWeight: 500, color: "#374151" }}>{`${dd}.${mm}.${selected.getFullYear()}`}</span>
      </button>
      {calendar}
    </>
  );
}

// ─── Total bar ────────────────────────────────────────────────────────────────

function TotalBar({ rows }: { rows: FilledRow[] }) {
  const total = rows.reduce((s, r) => s + r.volume * r.tariff, 0);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderTop: "1.5px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.50)" }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280", letterSpacing: "0.02em" }}>Итого</span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#059669", letterSpacing: "-0.03em" }}>{fmt(total)}</span>
    </div>
  );
}

// ─── Desktop: date picker ─────────────────────────────────────────────────────

const RU_MONTHS_SHORT = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const RU_DOW_SHORT    = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function DesktopDatePicker({ value, onChange, anchor, onClose }: {
  value: Date;
  onChange: (d: Date) => void;
  anchor: { top: number; left: number };
  onClose: () => void;
}) {
  const [vm, setVm] = useState(value.getMonth());
  const [vy, setVy] = useState(value.getFullYear());

  const firstDow = (new Date(vy, vm, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(vy, vm + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date();
  const isSel = (d: number) => value.getFullYear() === vy && value.getMonth() === vm && value.getDate() === d;
  const isToday = (d: number) => today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === d;

  const W = 268;
  const left = Math.min(anchor.left, window.innerWidth - W - 16);

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1500 }} />
      <div style={{
        position: "fixed", top: anchor.top, left,
        width: W, zIndex: 1501,
        background: "rgba(255,255,255,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: 18, boxShadow: "0 12px 40px rgba(0,0,0,0.16)",
        border: "1px solid rgba(0,0,0,0.08)",
        padding: "14px 14px 12px",
        fontFamily: "Inter, sans-serif",
        animation: "fadeUp 0.16s ease forwards",
      }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button onClick={() => vm === 0 ? (setVm(11), setVy(v => v - 1)) : setVm(v => v - 1)}
            style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.05)", cursor: "pointer", color: "#374151", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{RU_MONTHS_SHORT[vm]} {vy}</span>
          <button onClick={() => vm === 11 ? (setVm(0), setVy(v => v + 1)) : setVm(v => v + 1)}
            style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.05)", cursor: "pointer", color: "#374151", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
        </div>
        {/* Day-of-week headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {RU_DOW_SHORT.map(d => (
            <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 600, color: "#9ca3af", letterSpacing: "0.04em", padding: "2px 0" }}>{d}</div>
          ))}
        </div>
        {/* Days */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const sel = isSel(d), tod = isToday(d);
            const isSat = i % 7 === 5, isSun = i % 7 === 6;
            return (
              <button key={i} onClick={() => { onChange(new Date(vy, vm, d)); onClose(); }} style={{
                height: 32, borderRadius: 9, border: "none", cursor: "pointer",
                background: sel ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "transparent",
                color: sel ? "#fff" : tod ? "#FF6B00" : isSat || isSun ? "#ef4444" : "#111827",
                fontSize: 12, fontWeight: sel || tod ? 700 : 400,
                fontFamily: "Inter, sans-serif", outline: "none",
                boxShadow: sel ? "0 2px 8px rgba(255,107,0,0.30)" : "none",
                position: "relative",
              }}
                onMouseEnter={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.05)"; }}
                onMouseLeave={e => { if (!sel) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {d}
                {tod && !sel && <span style={{ position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)", width: 3, height: 3, borderRadius: "50%", background: "#FF6B00", display: "block" }} />}
              </button>
            );
          })}
        </div>
      </div>
    </>,
    document.body,
  );
}

// ─── Desktop: fixed-position dropdown ────────────────────────────────────────

function DesktopDropdown({ options, value, onSelect, onClose, anchor }: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  anchor: { top: number; left: number; width: number };
}) {
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000 }} />
      <div style={{
        position: "fixed", top: anchor.top, left: anchor.left,
        minWidth: anchor.width, zIndex: 2001,
        background: "#fff", borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden",
        animation: "fadeUp 0.14s ease forwards",
        fontFamily: "Inter, sans-serif",
      }}>
        {options.map(o => (
          <button key={o} onClick={() => { onSelect(o); onClose(); }} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            width: "100%", padding: "10px 14px", border: "none",
            background: o === value ? "rgba(255,107,0,0.06)" : "none",
            cursor: "pointer", fontFamily: "Inter, sans-serif",
            fontSize: 13, color: o === value ? "#c2500a" : "#111827",
            fontWeight: o === value ? 600 : 400, textAlign: "left",
            borderBottom: "1px solid rgba(0,0,0,0.04)",
          }}
            onMouseEnter={e => { if (o !== value) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
            onMouseLeave={e => { if (o !== value) (e.currentTarget as HTMLElement).style.background = "none"; }}
          >
            {o}
            {o === value && <Check size={13} strokeWidth={2.5} color="#FF6B00" />}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

// ─── Desktop: editable table row ─────────────────────────────────────────────

interface DesktopRowDraft {
  location: string; markingNum: string; markingType: string;
  volume: string; material: string; tariff: string;
}

const DESKTOP_COLS = [
  { key: "location",    label: "Место",         flex: 1.4 },
  { key: "markingNum",  label: "№ разметки",    flex: 0.9 },
  { key: "markingType", label: "Тип разметки",  flex: 1.6 },
  { key: "volume",      label: "Объём, м²",     flex: 0.8 },
  { key: "material",    label: "Материал",       flex: 1.2 },
  { key: "tariff",      label: "Тариф, ₽/м²",  flex: 0.8 },
  { key: "payment",     label: "Оплата",         flex: 1.0 },
] as const;

function DesktopEditRow({ initial, onSave, onCancel, isNew }: {
  initial: DesktopRowDraft;
  onSave: (d: DesktopRowDraft) => void;
  onCancel: () => void;
  isNew: boolean;
}) {
  const [draft, setDraft] = useState<DesktopRowDraft>(initial);
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [anchor, setAnchor] = useState({ top: 0, left: 0, width: 160 });
  const dict = useDict();

  const typeOptions = dict.markingTypes[draft.markingNum] || [];
  const payment = (parseFloat(draft.volume) || 0) * (parseFloat(draft.tariff) || 0);

  function openDrop(col: string, td: HTMLTableCellElement) {
    const r = td.getBoundingClientRect();
    setAnchor({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 160) });
    setOpenCol(col);
  }

  function set(col: string, val: string) {
    setDraft(p => { const n = { ...p, [col]: val }; if (col === "markingNum") n.markingType = ""; return n; });
  }

  const accent = isNew ? "rgba(255,107,0,0.04)" : "rgba(99,102,241,0.04)";
  const accentBorder = isNew ? "rgba(255,107,0,0.20)" : "rgba(99,102,241,0.20)";

  return (
    <>
      <tr>
        {DESKTOP_COLS.slice(0, -1).map(({ key: col }) => {
          const isNumeric = col === "volume" || col === "tariff";
          const isOpen = openCol === col;
          const options =
            col === "location"    ? dict.locations :
            col === "markingNum"  ? dict.markingNums :
            col === "markingType" ? typeOptions :
            col === "material"    ? dict.materials : null;
          const locked = col === "markingType" && !draft.markingNum;

          return (
            <td key={col}
              onClick={e => { if (!locked && options) openDrop(col, e.currentTarget); }}
              style={{
                padding: isNumeric ? "0 8px" : "0 12px", height: 46, verticalAlign: "middle",
                background: isOpen ? "rgba(255,107,0,0.08)" : accent,
                borderBottom: `1.5px solid ${accentBorder}`,
                cursor: locked ? "default" : options ? "pointer" : "text",
                outline: isOpen ? `2px solid ${isNew ? "rgba(255,107,0,0.40)" : "rgba(99,102,241,0.40)"}` : "none",
                outlineOffset: -1,
              }}
            >
              {locked ? (
                <span style={{ color: "#d1d5db", fontSize: 13 }}>—</span>
              ) : isNumeric ? (
                <input
                  type="number" min="0" value={(draft as any)[col]}
                  onChange={e => set(col, e.target.value)}
                  style={{ width: "100%", border: "none", background: "transparent", fontSize: 13, color: "#111827", fontFamily: "Inter, sans-serif", outline: "none" }}
                />
              ) : (
                <span style={{ fontSize: 13, color: (draft as any)[col] ? "#111827" : "#c4c9d4", fontWeight: (draft as any)[col] ? 500 : 400 }}>
                  {(draft as any)[col] || "Выбрать..."}
                </span>
              )}
              {options && openCol === col && (
                <DesktopDropdown
                  options={options} value={(draft as any)[col]}
                  onSelect={v => set(col, v)} onClose={() => setOpenCol(null)}
                  anchor={anchor}
                />
              )}
            </td>
          );
        })}
        {/* Payment + actions */}
        <td style={{ padding: "0 12px", height: 46, verticalAlign: "middle", background: accent, borderBottom: `1.5px solid ${accentBorder}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: payment > 0 ? "#059669" : "#c4c9d4", whiteSpace: "nowrap" }}>
              {payment > 0 ? payment.toLocaleString("ru-RU") + " ₽" : "—"}
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => onSave(draft)} style={{
                height: 28, padding: "0 10px", borderRadius: 8, border: "none",
                background: isNew ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "linear-gradient(135deg,#6366f1,#818cf8)",
                color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif",
              }}>
                {isNew ? "Добавить" : "Сохранить"}
              </button>
              <button onClick={onCancel} style={{ height: 28, padding: "0 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.10)", background: "transparent", color: "#9ca3af", fontSize: 12, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>✕</button>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

// ─── Desktop layout ───────────────────────────────────────────────────────────

function DesktopHomePage({ rows, setRows, participants, setParticipants, selectedDate, setSelectedDate, showConfirm, setShowConfirm, onConfirmSave }: {
  rows: FilledRow[];
  setRows: React.Dispatch<React.SetStateAction<FilledRow[]>>;
  participants: string[];
  setParticipants: (v: string[]) => void;
  selectedDate: Date;
  setSelectedDate: (d: Date) => void;
  showConfirm: boolean;
  setShowConfirm: (v: boolean) => void;
  onConfirmSave: () => void;
}) {
  const syncStatus = useSyncStatus();
  const dict = useDict();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateAnchor, setDateAnchor] = useState({ top: 0, left: 0 });
  const dateBtnRef = useRef<HTMLButtonElement>(null);

  const totalVol = rows.reduce((s, r) => s + r.volume, 0);
  const totalPay = rows.reduce((s, r) => s + r.volume * r.tariff, 0);
  const pp = participants.length > 0 ? Math.round(totalPay / participants.length) : 0;
  const canConfirm = rows.length > 0 && participants.length > 0;

  const dateStr = selectedDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });

  function handleSyncClick() {
    void (async () => {
      await syncNow();
      const err = peekSyncSnapshot().lastError;
      if (err) window.alert(err);
    })();
  }

  function openDatePicker() {
    const btn = dateBtnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setDateAnchor({ top: r.bottom + 6, left: r.left });
    setShowDatePicker(true);
  }

  function addRow(d: DesktopRowDraft) {
    setRows(p => [...p, {
      id: Date.now(), location: d.location, markingNum: d.markingNum,
      markingType: d.markingType, volume: parseFloat(d.volume) || 0,
      material: d.material, tariff: parseFloat(d.tariff) || 0,
    }]);
    setAdding(false);
  }

  function saveRow(id: number, d: DesktopRowDraft) {
    setRows(p => p.map(r => r.id === id ? {
      ...r, location: d.location, markingNum: d.markingNum, markingType: d.markingType,
      volume: parseFloat(d.volume) || 0, material: d.material, tariff: parseFloat(d.tariff) || 0,
    } : r));
    setEditingId(null);
  }

  function toggleParticipant(p: string) {
    setParticipants(participants.includes(p) ? participants.filter(x => x !== p) : [...participants, p]);
  }

  return (
    <div style={{ padding: "0 32px 40px 32px", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "32px 0 24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: "#111827", letterSpacing: "-0.04em" }}>Смена</h1>
          <StatusBadge status={syncStatus} onClick={handleSyncClick} />
        </div>
        <button
          ref={dateBtnRef}
          onClick={openDatePicker}
          style={{
            fontSize: 14, color: showDatePicker ? "#FF6B00" : "#6b7280", fontWeight: 500,
            background: showDatePicker ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.72)",
            borderRadius: 10, padding: "8px 14px",
            border: showDatePicker ? "1px solid rgba(255,107,0,0.40)" : "1px solid rgba(0,0,0,0.07)",
            cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
            boxShadow: showDatePicker ? "0 0 0 3px rgba(255,107,0,0.10)" : "none",
            display: "flex", alignItems: "center", gap: 7,
            transition: "border-color 0.15s, color 0.15s, box-shadow 0.15s",
          }}
        >
          <Calendar size={14} strokeWidth={2} color={showDatePicker ? "#FF6B00" : "#9ca3af"} />
          {dateStr}
        </button>
        {showDatePicker && (
          <DesktopDatePicker
            value={selectedDate}
            onChange={d => { setSelectedDate(d); }}
            anchor={dateAnchor}
            onClose={() => setShowDatePicker(false)}
          />
        )}
      </div>

      {/* Content row */}
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>

        {/* Table */}
        <div style={{ flex: 1, minWidth: 0, background: "rgba(255,255,255,0.80)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.65)", boxShadow: "0 4px 24px rgba(0,0,0,0.07)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              {DESKTOP_COLS.map(c => <col key={c.key} style={{ width: `${c.flex / DESKTOP_COLS.reduce((s, x) => s + x.flex, 0) * 100}%` }} />)}
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: "1.5px solid rgba(0,0,0,0.07)" }}>
                {DESKTOP_COLS.map(c => (
                  <th key={c.key} style={{ padding: "14px 12px", fontSize: 11, fontWeight: 600, color: "#9ca3af", textAlign: "left", letterSpacing: "0.04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                    {c.label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                if (editingId === row.id) {
                  return (
                    <DesktopEditRow key={row.id} isNew={false}
                      initial={{ location: row.location, markingNum: row.markingNum, markingType: row.markingType, volume: String(row.volume), material: row.material, tariff: String(row.tariff) }}
                      onSave={d => saveRow(row.id, d)} onCancel={() => setEditingId(null)}
                    />
                  );
                }
                const hov = hoveredId === row.id;
                return (
                  <tr key={row.id}
                    onClick={() => { setAdding(false); setEditingId(row.id); }}
                    onMouseEnter={() => setHoveredId(row.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ cursor: "pointer", background: hov ? "rgba(0,0,0,0.025)" : "transparent", transition: "background 0.1s" }}
                  >
                    {[row.location, row.markingNum, row.markingType, row.volume + " м²", row.material, row.tariff + " ₽"].map((val, i) => (
                      <td key={i} style={{ padding: "0 12px", height: 48, verticalAlign: "middle", borderBottom: "1px solid rgba(0,0,0,0.05)", fontSize: 13, color: "#111827", fontWeight: i === 0 ? 500 : 400 }}>
                        {val}
                      </td>
                    ))}
                    <td style={{ padding: "0 12px", height: 48, verticalAlign: "middle", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>{fmt(row.volume * row.tariff)}</span>
                        {hov && (
                          <button onClick={e => { e.stopPropagation(); setRows(p => p.filter(r => r.id !== row.id)); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", display: "flex", padding: 4, borderRadius: 6, outline: "none" }}>
                            <Trash2 size={14} strokeWidth={2} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ width: 36, borderBottom: "1px solid rgba(0,0,0,0.05)" }} />
                  </tr>
                );
              })}

              {adding && (
                <DesktopEditRow isNew={true}
                  initial={{ location: "", markingNum: "", markingType: "", volume: "", material: "", tariff: "" }}
                  onSave={addRow} onCancel={() => setAdding(false)}
                />
              )}

              {!adding && (
                <tr onClick={() => { setEditingId(null); setAdding(true); }} style={{ cursor: "pointer" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.02)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td colSpan={DESKTOP_COLS.length + 1} style={{ padding: "0 12px", height: 44, verticalAlign: "middle", borderTop: "1px dashed rgba(0,0,0,0.10)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, border: "1.5px dashed #d1d5db", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Plus size={11} strokeWidth={2.5} color="#d1d5db" />
                      </div>
                      <span style={{ fontSize: 13, color: "#c4c9d4", fontStyle: "italic" }}>Добавить работу...</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Total row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 24, padding: "12px 20px", borderTop: "1.5px solid rgba(0,0,0,0.06)", background: "rgba(255,255,255,0.50)" }}>
            <span style={{ fontSize: 13, color: "#6b7280", fontWeight: 500 }}>Итого объём: <strong style={{ color: "#6366f1" }}>{totalVol.toLocaleString("ru-RU")} м²</strong></span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#059669", letterSpacing: "-0.02em" }}>{fmt(totalPay)}</span>
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ background: "rgba(255,255,255,0.80)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.65)", boxShadow: "0 4px 24px rgba(0,0,0,0.07)", padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 14 }}>Итоги смены</div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Общий объём",  value: totalVol.toLocaleString("ru-RU") + " м²", color: "#6366f1", bg: "rgba(99,102,241,0.07)" },
                { label: "Общая сумма",  value: fmt(totalPay),                              color: "#059669", bg: "rgba(5,150,105,0.07)"   },
                ...(participants.length > 0 ? [{ label: "На каждого", value: fmt(pp), color: "#FF6B00", bg: "rgba(255,107,0,0.07)" }] : []),
              ].map(({ label, value, color, bg }) => (
                <div key={label} style={{ background: bg, borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: "-0.04em" }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Участники смены</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {dict.participants.map(p => {
                const on = participants.includes(p);
                return (
                  <button key={p} onClick={() => toggleParticipant(p)} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                    borderRadius: 10, border: "none", cursor: "pointer",
                    background: on ? "rgba(99,102,241,0.08)" : "rgba(0,0,0,0.04)",
                    fontFamily: "Inter, sans-serif", outline: "none", transition: "background 0.15s",
                  }}>
                    <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, border: on ? "none" : "1.5px solid #d1d5db", background: on ? "linear-gradient(135deg,#6366f1,#818cf8)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {on && <Check size={11} strokeWidth={2.5} color="#fff" />}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{p}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button onClick={() => setShowConfirm(true)} disabled={!canConfirm} style={{
            width: "100%", height: 48, borderRadius: 14, border: "none",
            background: canConfirm ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "rgba(0,0,0,0.07)",
            color: canConfirm ? "#fff" : "#c4c9d4",
            fontSize: 15, fontWeight: 700, cursor: canConfirm ? "pointer" : "not-allowed",
            fontFamily: "Inter, sans-serif", outline: "none",
            boxShadow: canConfirm ? "0 6px 20px rgba(255,107,0,0.30)" : "none",
            transition: "background 0.2s, box-shadow 0.2s",
          }}>
            Подтвердить смену
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmSheet
          rows={rows}
          participants={participants}
          date={selectedDate}
          onClose={() => setShowConfirm(false)}
          onSave={onConfirmSave}
        />
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { phoneRef, registerAddRow, isDesktop } = useOutletContext<ShellContext>();
  const syncStatus = useSyncStatus();
  const dicts = useDictionaries();
  const dictOptions = useMemo(
    () => (dicts ? toDictOptions(dicts) : toDictOptions(DEFAULT_DICTIONARIES)),
    [dicts],
  );
  const [rows, setRows] = useState<FilledRow[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const participantsInited = useRef(false);

  function handleSyncClick() {
    void (async () => {
      await syncNow();
      const err = peekSyncSnapshot().lastError;
      if (err) window.alert(err);
    })();
  }

  // Участники: из PB users (full_name); по умолчанию — только текущий пользователь
  useEffect(() => {
    if (!dicts || participantsInited.current) return;
    const me = getCurrentUserFullName();
    const names = dicts.participants.map((p) => p.name);
    if (me && names.includes(me)) setParticipants([me]);
    else if (me) setParticipants([me]);
    else if (names[0]) setParticipants([names[0]]);
    participantsInited.current = true;
  }, [dicts]);

  useEffect(() => {
    registerAddRow((quick: QuickRow) => {
      setRows((prev) => [...prev, {
        id: Date.now(),
        location:    quick.location    || dictOptions.locations[1] || dictOptions.locations[0] || "",
        markingNum:  quick.markingNum  || "",
        markingType: quick.markingType || "",
        volume:      quick.volume      || 0,
        material:    quick.material    || "",
        tariff:      quick.tariff      || 0,
      }]);
    });
  }, [dictOptions.locations, registerAddRow]);

  async function handleConfirmSave() {
    if (saving || rows.length === 0 || participants.length === 0) return;
    setSaving(true);
    try {
      await confirmShift({
        date: selectedDate,
        participants,
        rows: rows.map(({ location, markingNum, markingType, volume, material, tariff }) => ({
          location, markingNum, markingType, volume, material, tariff,
        })),
      });
      setRows([]);
      setShowConfirm(false);
    } finally {
      setSaving(false);
    }
  }

  const total = rows.reduce((s, r) => s + r.volume * r.tariff, 0);
  const canConfirm = rows.length > 0 && participants.length > 0;

  const body = isDesktop ? (
    <DesktopHomePage
      rows={rows} setRows={setRows}
      participants={participants} setParticipants={setParticipants}
      selectedDate={selectedDate} setSelectedDate={setSelectedDate}
      showConfirm={showConfirm} setShowConfirm={setShowConfirm}
      onConfirmSave={() => { void handleConfirmSave(); }}
    />
  ) : (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "52px 20px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em", whiteSpace: "nowrap" }}>Смена</h1>
          <StatusBadge status={syncStatus} compact onClick={handleSyncClick} />
        </div>
        <DateChip selected={selectedDate} setSelected={setSelectedDate} portalTarget={phoneRef.current} />
      </div>

      {/* Body — скролл страницы в AppShell */}
      <div style={{ paddingBottom: 110 }}>

        {/* Table card */}
        <div style={{ margin: "14px 16px 0", background: "rgba(255,255,255,0.68)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "visible", position: "relative" }}>
          <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>Работы</p>
            <span style={{ fontSize: 11, color: "#c4c9d4" }}>← смахните для удаления</span>
          </div>
          <div style={{ overflow: "hidden", borderRadius: "0 0 0 0" }}>
            <WorkTable rows={rows} setRows={setRows} phoneRef={phoneRef} />
          </div>
          <TotalBar rows={rows} />
        </div>

        {/* Confirm button */}
        <div style={{ padding: "14px 16px 6px" }}>
          <button
            onClick={() => setShowConfirm(true)}
            style={{
              width: "100%", height: 50, borderRadius: 14, border: "none",
              background: canConfirm ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "rgba(0,0,0,0.07)",
              color: canConfirm ? "#fff" : "#b0b7c3",
              fontSize: 15, fontWeight: 600, fontFamily: "Inter, sans-serif", letterSpacing: "-0.01em",
              cursor: canConfirm ? "pointer" : "not-allowed", outline: "none",
              boxShadow: canConfirm ? "0 6px 20px rgba(255,107,0,0.28)" : "none",
              transition: "transform 0.12s, box-shadow 0.12s",
            }}
            disabled={!canConfirm}
            onMouseDown={(e) => { if (canConfirm) { e.currentTarget.style.transform = "scale(0.97)"; e.currentTarget.style.boxShadow = "0 3px 10px rgba(255,107,0,0.22)"; }}}
            onMouseUp={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = canConfirm ? "0 6px 20px rgba(255,107,0,0.28)" : "none"; }}
          >
            {canConfirm ? `Подтвердить смену · ${fmt(total)}` : rows.length === 0 ? "Подтвердить смену" : "Выберите участников"}
          </button>
        </div>

        <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "10px 16px" }} />

        {/* Participants */}
        <div style={{ margin: "0 16px 14px", background: "rgba(255,255,255,0.68)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 18, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "visible" }}>
          <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>Участники смены</p>
          </div>
          <ParticipantsBlock selected={participants} setSelected={setParticipants} />
        </div>
      </div>

      {showConfirm && (
        <ConfirmSheet
          rows={rows}
          participants={participants}
          date={selectedDate}
          onClose={() => setShowConfirm(false)}
          onSave={() => { void handleConfirmSave(); }}
        />
      )}
    </div>
  );

  return <DictContext.Provider value={dictOptions}>{body}</DictContext.Provider>;
}
