import { useNavigate, useLocation } from "react-router";
import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Home, List, User, Plus, X, Search, Check } from "lucide-react";

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "home",    icon: Home, label: "Главная",  path: "/home" },
  { id: "history", icon: List, label: "История",  path: "/history" },
  { id: "profile", icon: User, label: "Профиль",  path: "/profile" },
] as const;

/** Горизонтальный свайп по пилюле вкладок (не по FAB и не по контенту страниц —
 *  там уже swipe-delete / горизонтальный скролл таблицы). */
const NAV_SWIPE_MIN_DX = 48;
const NAV_SWIPE_MAX_DY = 36;

export function BottomNav({ onFabClick }: { onFabClick?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const activeIdx = TABS.findIndex(
    ({ id, path }) => pathname === path || (pathname === "/" && id === "home"),
  );

  function goRelative(delta: number) {
    const idx = activeIdx < 0 ? 0 : activeIdx;
    const next = idx + delta;
    if (next < 0 || next >= TABS.length) return;
    navigate(TABS[next].path);
  }

  function onPillPointerDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swipeStart.current = { x: e.clientX, y: e.clientY };
    suppressClick.current = false;
  }

  function onPillPointerUp(e: React.PointerEvent) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < NAV_SWIPE_MIN_DX) return;
    if (Math.abs(dy) > NAV_SWIPE_MAX_DY) return;
    if (Math.abs(dx) <= Math.abs(dy)) return;
    suppressClick.current = true;
    // свайп влево → следующая вкладка; вправо → предыдущая
    goRelative(dx < 0 ? 1 : -1);
  }

  function onPillPointerCancel() {
    swipeStart.current = null;
  }

  function onTabClick(path: string, e: React.MouseEvent) {
    if (suppressClick.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClick.current = false;
      return;
    }
    navigate(path);
  }

  return (
    <div style={{
      // absolute в shell (не fixed): один stacking context с #app-portal — иначе iOS рисует nav поверх sheet
      position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 40,
      padding: "0 16px calc(16px + env(safe-area-inset-bottom, 0px))",
      display: "flex", alignItems: "center", gap: 10,
      pointerEvents: "none",
    }}>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, pointerEvents: "auto" }}>
      <div
        onPointerDown={onPillPointerDown}
        onPointerUp={onPillPointerUp}
        onPointerCancel={onPillPointerCancel}
        style={{
        flex: 1, height: 64,
        background: "rgba(255,255,255,0.62)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: 999, border: "1px solid rgba(255,255,255,0.55)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", padding: "6px 8px", gap: 4,
        touchAction: "pan-y",
      }}>
        {TABS.map(({ id, icon: Icon, label, path }) => {
          const isActive = pathname === path || (pathname === "/" && id === "home");
          return (
            <button key={id} onClick={(e) => onTabClick(path, e)} style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              height: 52, borderRadius: 999, border: "none", cursor: "pointer",
              padding: isActive ? "0 18px" : "0 14px",
              background: isActive ? "rgba(255,255,255,0.90)" : "transparent",
              boxShadow: isActive ? "0 2px 8px rgba(0,0,0,0.09), 0 0 0 1px rgba(0,0,0,0.04)" : "none",
              flex: isActive ? "1 1 auto" : "0 0 auto",
              minWidth: isActive ? 0 : 44,
              transition: "flex 0.35s cubic-bezier(0.34,1.56,0.64,1), background 0.2s, box-shadow 0.2s, padding 0.3s",
              fontFamily: "Inter, sans-serif", outline: "none", WebkitTapHighlightColor: "transparent",
            }}>
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} style={{ color: isActive ? "#111827" : "#9ca3af", flexShrink: 0, transition: "color 0.2s" }} />
              {isActive && (
                <span style={{ fontSize: 13, fontWeight: 600, color: "#111827", whiteSpace: "nowrap", letterSpacing: "-0.02em", animation: "navFadeIn 0.25s ease forwards" }}>
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button onClick={onFabClick} style={{
        width: 56, height: 56, borderRadius: "50%", border: "none", cursor: "pointer",
        background: "linear-gradient(135deg, #FF6B00 0%, #FF9A00 100%)",
        boxShadow: "0 8px 24px rgba(255,107,0,0.38), 0 2px 6px rgba(255,107,0,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, outline: "none", WebkitTapHighlightColor: "transparent",
        transition: "transform 0.12s",
      }}
        onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.92)")}
        onMouseUp={(e) => (e.currentTarget.style.transform = "")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "")}
      >
        <Plus size={22} strokeWidth={2.5} color="#ffffff" />
      </button>
      </div>
    </div>
  );
}

// ─── Sync Status Badge ────────────────────────────────────────────────────────

export type SyncStatus = "offline" | "syncing" | "pending" | "synced";

export const STATUS_CONFIG: Record<SyncStatus, { label: string; shortLabel: string; color: string; animate: boolean }> = {
  offline: { label: "Офлайн",              shortLabel: "Офлайн",  color: "#9ca3af", animate: false },
  syncing: { label: "Синхронизация...",    shortLabel: "Синхр…",  color: "#f59e0b", animate: true  },
  pending: { label: "Не синхронизировано", shortLabel: "Не синхр.", color: "#ef4444", animate: false },
  synced:  { label: "Синхронизировано",    shortLabel: "Синхр.",  color: "#22c55e", animate: false },
};

export function StatusBadge({ status, onClick, compact }: { status: SyncStatus; onClick: () => void; compact?: boolean }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <button
      onClick={onClick}
      title={cfg.label}
      style={{
      display: "inline-flex", alignItems: "center", gap: compact ? 4 : 6,
      background: "rgba(255,255,255,0.72)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.45)",
      borderRadius: 999, padding: compact ? "3px 7px 3px 6px" : "5px 10px 5px 8px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
      WebkitTapHighlightColor: "transparent", flexShrink: 0, maxWidth: "100%",
    }}>
      <span style={{
        width: compact ? 6 : 7, height: compact ? 6 : 7, borderRadius: "50%", background: cfg.color,
        flexShrink: 0, display: "block",
        animation: cfg.animate ? "spin 1.2s linear infinite" : "none",
      }} />
      <span style={{
        fontSize: compact ? 10 : 12, fontWeight: 500, color: "#374151",
        letterSpacing: "-0.01em", whiteSpace: "nowrap",
      }}>
        {compact ? cfg.shortLabel : cfg.label}
      </span>
    </button>
  );
}

// ─── Dropdown (marking numbers + plain lists) ─────────────────────────────────

export type MarkingNumMeta = {
  /** Отображаемый номер (PB `number`). */
  label: string;
  description?: string;
  imageUrls: string[];
};

export function DropdownCard({ options, value, onSelect, onClose, withSearch, top, left, width, step, optionMeta }: {
  options: string[]; value: string; onSelect: (v: string) => void; onClose: () => void;
  withSearch: boolean; top: number; left: number; width: number; step: number;
  optionMeta?: Record<string, MarkingNumMeta>;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rich = Boolean(optionMeta);

  useEffect(() => {
    // pointerdown + rAF: на iOS synthetic mousedown от тапа открытия сразу закрывал dropdown
    let remove: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {
      const h = (e: PointerEvent) => {
        const el = document.getElementById("dd-card");
        if (el && !el.contains(e.target as Node)) onClose();
      };
      document.addEventListener("pointerdown", h);
      remove = () => document.removeEventListener("pointerdown", h);
    });
    return () => {
      cancelAnimationFrame(raf);
      remove?.();
    };
  }, [onClose]);

  const q = query.toLowerCase();
  const filtered = options.filter((o) => {
    if (!q) return true;
    const meta = optionMeta?.[o];
    const label = (meta?.label ?? o).toLowerCase();
    if (label.includes(q) || o.toLowerCase().includes(q)) return true;
    const desc = meta?.description;
    return Boolean(desc && desc.toLowerCase().includes(q));
  });

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
      <div style={{ maxHeight: rich ? 280 : 200, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {filtered.map((opt) => {
          const isSel = value === opt;
          const meta = optionMeta?.[opt];
          const imgs = meta?.imageUrls ?? [];
          const desc = meta?.description?.trim();
          if (rich) {
            return (
              <button
                key={opt}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => { onSelect(opt); onClose(); }}
                style={{
                  width: "100%", padding: "10px 14px",
                  display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4,
                  background: isSel ? "rgba(255,107,0,0.07)" : "transparent",
                  border: "none", borderBottom: "1px solid rgba(0,0,0,0.04)",
                  cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
                  WebkitTapHighlightColor: "transparent", textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, color: isSel ? "#c2500a" : "#111827", fontWeight: isSel ? 600 : 500, flexShrink: 0 }}>{meta?.label ?? opt}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", flexShrink: 0 }}>
                    {imgs.slice(0, 3).map((src) => (
                      <img
                        key={src}
                        src={src}
                        alt=""
                        loading="lazy"
                        style={{ width: 36, height: 28, objectFit: "contain", borderRadius: 4, background: "rgba(0,0,0,0.03)", display: "block" }}
                      />
                    ))}
                    {isSel && <Check size={14} strokeWidth={2.5} color="#FF6B00" style={{ marginLeft: 2 }} />}
                  </div>
                </div>
                {desc ? (
                  <span style={{ fontSize: 11, fontWeight: 300, color: "#9ca3af", lineHeight: 1.35 }}>{desc}</span>
                ) : null}
              </button>
            );
          }
          return (
            <button
              key={opt}
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(opt); onClose(); }}
              style={{
              width: "100%", minHeight: 40, padding: "0 14px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: isSel ? "rgba(255,107,0,0.07)" : "transparent",
              border: "none", borderBottom: "1px solid rgba(0,0,0,0.04)",
              cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
              WebkitTapHighlightColor: "transparent",
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

export function DesktopDropdown({ options, value, onSelect, onClose, anchor, optionMeta }: {
  options: string[];
  value: string;
  onSelect: (v: string) => void;
  onClose: () => void;
  anchor: { top: number; left: number; width: number };
  optionMeta?: Record<string, MarkingNumMeta>;
}) {
  const rich = Boolean(optionMeta);
  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000 }} />
      <div style={{
        position: "fixed", top: anchor.top, left: anchor.left,
        minWidth: rich ? Math.max(anchor.width, 280) : anchor.width,
        width: rich ? Math.max(anchor.width, 280) : undefined,
        zIndex: 2001,
        background: "#fff", borderRadius: 12,
        boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
        border: "1px solid rgba(0,0,0,0.08)", overflow: "hidden",
        animation: "fadeUp 0.14s ease forwards",
        fontFamily: "Inter, sans-serif",
        maxHeight: rich ? 320 : undefined,
        overflowY: rich ? "auto" : undefined,
      }}>
        {options.map(o => {
          const isSel = o === value;
          const meta = optionMeta?.[o];
          const imgs = meta?.imageUrls ?? [];
          const desc = meta?.description?.trim();
          if (rich) {
            return (
              <button key={o} onClick={() => { onSelect(o); onClose(); }} style={{
                display: "flex", flexDirection: "column", alignItems: "stretch", gap: 4,
                width: "100%", padding: "10px 14px", border: "none",
                background: isSel ? "rgba(255,107,0,0.06)" : "none",
                cursor: "pointer", fontFamily: "Inter, sans-serif", textAlign: "left",
                borderBottom: "1px solid rgba(0,0,0,0.04)",
              }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 13, color: isSel ? "#c2500a" : "#111827", fontWeight: isSel ? 600 : 500 }}>{meta?.label ?? o}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", flexShrink: 0 }}>
                    {imgs.slice(0, 3).map((src) => (
                      <img key={src} src={src} alt="" loading="lazy" style={{ width: 40, height: 30, objectFit: "contain", borderRadius: 4, background: "rgba(0,0,0,0.03)", display: "block" }} />
                    ))}
                    {isSel && <Check size={13} strokeWidth={2.5} color="#FF6B00" />}
                  </div>
                </div>
                {desc ? <span style={{ fontSize: 11, fontWeight: 300, color: "#9ca3af", lineHeight: 1.35 }}>{desc}</span> : null}
              </button>
            );
          }
          return (
            <button key={o} onClick={() => { onSelect(o); onClose(); }} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              width: "100%", padding: "10px 14px", border: "none",
              background: isSel ? "rgba(255,107,0,0.06)" : "none",
              cursor: "pointer", fontFamily: "Inter, sans-serif",
              fontSize: 13, color: isSel ? "#c2500a" : "#111827",
              fontWeight: isSel ? 600 : 400, textAlign: "left",
              borderBottom: "1px solid rgba(0,0,0,0.04)",
            }}
              onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
              onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = "none"; }}
            >
              {o}
              {isSel && <Check size={13} strokeWidth={2.5} color="#FF6B00" />}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}
