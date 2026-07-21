import { useState, useRef, useEffect, useMemo } from "react";
import { Calendar, SlidersHorizontal, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import { createPortal } from "react-dom";
import type { CachedShift } from "../lib/db";
import { formatRuDate, fromIsoDate, useDictionaries, useShifts } from "../lib/sync";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkRow {
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
  participants: string[];
  rows: WorkRow[];
  pendingSync?: boolean;
}

function cachedToShift(s: CachedShift): Shift {
  return {
    id: s.id,
    date: formatRuDate(s.date),
    dateObj: fromIsoDate(s.date),
    participants: s.participants,
    rows: s.rows.map((r) => ({
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

// ─── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({ shift }: { shift: Shift }) {
  const [open, setOpen] = useState(false);
  const total = shiftTotal(shift);
  const pp = perPerson(shift);
  const totalVol = shift.rows.reduce((s, r) => s + r.volume, 0);

  const preview = shift.rows
    .map(r => `${r.markingNum} — ${r.markingType} · ${fmtVol(r.volume)}`)
    .join("  ·  ");

  return (
    <div style={{
      background: "rgba(255,255,255,0.72)",
      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.65)",
      borderRadius: 18, overflow: "hidden",
      boxShadow: open ? "0 4px 20px rgba(0,0,0,0.10)" : "0 2px 10px rgba(0,0,0,0.05)",
      transition: "box-shadow 0.2s",
    }}>
      {/* Collapsed row */}
      <button onClick={() => setOpen(o => !o)} style={{
        width: "100%", display: "flex", alignItems: "flex-start", gap: 10,
        padding: "14px 16px", background: "none", border: "none", cursor: "pointer",
        fontFamily: "Inter, sans-serif", outline: "none", textAlign: "left",
      }}>
        {/* Date pill */}
        <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 2 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em", lineHeight: 1 }}>
            {shift.date.slice(0, 2)}
          </span>
          <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 500, letterSpacing: "0.01em" }}>
            {shift.date.slice(3, 5)}.{shift.date.slice(8)}
          </span>
        </div>

        {/* Middle */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {shift.participants.map(initials).join(", ")}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {preview}
          </div>
        </div>

        {/* Right */}
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
      </button>

      {/* Expanded body */}
      {open && (
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "12px 16px 16px", animation: "fadeUp 0.18s ease forwards" }}>
          <style>{`@keyframes fadeUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }`}</style>

          {/* Works table */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            {shift.rows.map((r, i) => (
              <div key={i} style={{ background: "rgba(0,0,0,0.025)", borderRadius: 10, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", letterSpacing: "-0.02em", marginBottom: 2 }}>
                    {r.markingNum} — {r.markingType}
                  </div>
                  <div style={{ fontSize: 11, color: "#9ca3af" }}>
                    {r.material} · тариф {r.tariff} ₽/м²
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{fmtVol(r.volume)}</div>
                  <div style={{ fontSize: 12, color: "#059669", fontWeight: 600 }}>{fmt(r.volume * r.tariff)}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", marginBottom: 12 }} />

          {/* Summary */}
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

          {/* Participants breakdown */}
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const cached = useShifts();
  const dicts = useDictionaries();
  const shifts = useMemo(() => cached.map(cachedToShift), [cached]);
  const participantOptions = useMemo(() => {
    if (dicts?.participants.length) return dicts.participants.map((p) => p.name);
    const set = new Set<string>();
    for (const s of shifts) for (const p of s.participants) set.add(p);
    return [...set];
  }, [dicts, shifts]);

  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [showCal, setShowCal] = useState(false);
  const [calPos, setCalPos] = useState({ top: 0, left: 0 });
  const calBtnRef = useRef<HTMLButtonElement>(null);

  const [showFilter, setShowFilter] = useState(false);
  const [filterParticipants, setFilterParticipants] = useState<string[]>([]);

  const filtered = shifts.filter(s => {
    const inRange =
      (!dateRange.from || s.dateObj >= dateRange.from) &&
      (!dateRange.to || s.dateObj <= dateRange.to);
    const matchParticipants =
      filterParticipants.length === 0 ||
      filterParticipants.every(p => s.participants.includes(p));
    return inRange && matchParticipants;
  });

  // Totals: объём + сумма смен; доля на человека — поровну в каждой смене
  const totalVol = filtered.reduce((s, sh) => s + sh.rows.reduce((a, r) => a + r.volume, 0), 0);
  const totalPay = filtered.reduce((s, sh) => s + shiftTotal(sh), 0);
  const totalPerPerson = filtered.reduce((s, sh) => s + perPerson(sh), 0);

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
      {/* Header */}
      <div style={{ padding: "52px 20px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em" }}>История</h1>
          <div style={{ display: "flex", gap: 8 }}>
            {/* Filter button */}
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
            {/* Calendar button */}
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

      {/* List */}
      <div style={{ padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: 10, paddingBottom: 110 }}>
        {filtered.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 48, opacity: 0.5 }}>
            <Calendar size={36} strokeWidth={1.3} color="#9ca3af" />
            <p style={{ margin: 0, fontSize: 14, color: "#9ca3af", textAlign: "center" }}>Смены не найдены</p>
          </div>
        ) : (
          filtered.map(shift => <ShiftCard key={shift.id} shift={shift} />)
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

      {/* Calendar portal */}
      {showCal && (
        <MiniCalendar
          range={dateRange}
          onChange={setDateRange}
          onClose={() => setShowCal(false)}
          top={calPos.top}
          left={calPos.left}
        />
      )}

      {/* Filter sheet portal */}
      {showFilter && (
        <FilterSheet
          selected={filterParticipants}
          onChange={setFilterParticipants}
          onClose={() => setShowFilter(false)}
          options={participantOptions}
        />
      )}
    </div>
  );
}
