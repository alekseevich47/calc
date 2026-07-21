import { useNavigate, useLocation } from "react-router";
import { Home, List, User, Plus } from "lucide-react";

// ─── Bottom Nav ───────────────────────────────────────────────────────────────

const TABS = [
  { id: "home",    icon: Home, label: "Главная",  path: "/home" },
  { id: "history", icon: List, label: "История",  path: "/history" },
  { id: "profile", icon: User, label: "Профиль",  path: "/profile" },
] as const;

export function BottomNav({ onFabClick }: { onFabClick?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, display: "flex", alignItems: "center", gap: 10, zIndex: 20 }}>
      <div style={{
        flex: 1, height: 64,
        background: "rgba(255,255,255,0.62)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: 999, border: "1px solid rgba(255,255,255,0.55)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.10), 0 1px 2px rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center", padding: "6px 8px", gap: 4,
      }}>
        {TABS.map(({ id, icon: Icon, label, path }) => {
          const isActive = pathname === path || (pathname === "/" && id === "home");
          return (
            <button key={id} onClick={() => navigate(path)} style={{
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
  );
}

// ─── Sync Status Badge ────────────────────────────────────────────────────────

export type SyncStatus = "offline" | "syncing" | "pending" | "synced";

export const STATUS_CONFIG: Record<SyncStatus, { label: string; color: string; animate: boolean }> = {
  offline: { label: "Офлайн",              color: "#9ca3af", animate: false },
  syncing: { label: "Синхронизация...",    color: "#f59e0b", animate: true  },
  pending: { label: "Не синхронизировано", color: "#ef4444", animate: false },
  synced:  { label: "Синхронизировано",    color: "#22c55e", animate: false },
};

export function StatusBadge({ status, onClick }: { status: SyncStatus; onClick: () => void }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "rgba(255,255,255,0.72)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.45)",
      borderRadius: 999, padding: "5px 10px 5px 8px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      cursor: "pointer", outline: "none", fontFamily: "Inter, sans-serif",
      WebkitTapHighlightColor: "transparent",
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", background: cfg.color,
        flexShrink: 0, display: "block",
        animation: cfg.animate ? "spin 1.2s linear infinite" : "none",
      }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
        {cfg.label}
      </span>
    </button>
  );
}

// ─── Global styles injection ──────────────────────────────────────────────────

export function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
      * { box-sizing: border-box; }
      @keyframes navFadeIn { from { opacity:0; transform:translateX(-4px); } to { opacity:1; transform:translateX(0); } }
      @keyframes fadeUp    { from { opacity:0; transform:translateY(8px);  } to { opacity:1; transform:translateY(0); } }
      @keyframes spin      { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
      ::-webkit-scrollbar { height: 3px; width: 3px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 99px; }
      input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      input[type=number] { -moz-appearance: textfield; }
    `}</style>
  );
}
