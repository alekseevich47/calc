import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface DateRange {
  from: Date | null;
  to: Date | null;
}

export function MiniCalendar({ range, onChange, onClose, top, left }: {
  range: DateRange;
  onChange: (r: DateRange) => void;
  onClose: () => void;
  top: number;
  left: number;
}) {
  const [viewDate, setViewDate] = useState(() => range.from ?? new Date());

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
          <button type="button" onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.05)", cursor: "pointer", color: "#374151", fontSize: 14 }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", textTransform: "capitalize" }}>{monthName}</span>
          <button type="button" onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.05)", cursor: "pointer", color: "#374151", fontSize: 14 }}>›</button>
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
              <button key={i} type="button" onClick={() => handleDay(d)} style={{
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
          <button type="button" onClick={() => onChange({ from: null, to: null })} style={{ flex: 1, height: 32, borderRadius: 10, border: "1px solid rgba(0,0,0,0.10)", background: "transparent", fontSize: 12, color: "#6b7280", cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Сбросить</button>
          <button type="button" onClick={onClose} style={{ flex: 1, height: 32, borderRadius: 10, border: "none", background: "linear-gradient(135deg,#FF6B00,#FF9A00)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Inter, sans-serif" }}>Готово</button>
        </div>
      </div>
    </>,
    document.getElementById("app-portal")!,
  );
}
