import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { User, LogOut, ChevronRight, Wifi, WifiOff, RefreshCw, CloudOff, Globe, Info, X, Check, Zap } from "lucide-react";
import { createPortal } from "react-dom";
import type { SyncStatus } from "../components/shared";
import {
  setGraphicsQuality,
  useGraphicsQuality,
  type GraphicsQuality,
} from "../lib/graphicsPreference";
import { clearSession, getCurrentUserFullName, subscribeAuthStore } from "../lib/session";
import {
  computeUserStats,
  peekSyncSnapshot,
  syncNow,
  useShifts,
  useSyncStatus,
  type StatsPeriod,
} from "../lib/sync";

type Period = StatsPeriod;
const PERIOD_LABELS: { key: Period; label: string }[] = [
  { key: "week",    label: "Неделя"    },
  { key: "month",   label: "Месяц"     },
  { key: "alltime", label: "Всё время" },
];

const LANG_OPTIONS = ["Русский", "English"];

const GRAPHICS_OPTIONS: { value: GraphicsQuality; label: string }[] = [
  { value: "high", label: "Высокая" },
  { value: "low", label: "Низкая" },
];

function fmt(n: number) {
  return n.toLocaleString("ru-RU") + " ₽";
}
function fmtVol(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 м²";
  return `${Number(n.toFixed(3)).toLocaleString("ru-RU")} м²`;
}

const SYNC_CFG: Record<SyncStatus, { label: string; color: string; bg: string; icon: typeof Wifi }> = {
  offline: { label: "Офлайн",              color: "#9ca3af", bg: "rgba(156,163,175,0.10)", icon: WifiOff  },
  syncing: { label: "Синхронизация...",    color: "#f59e0b", bg: "rgba(245,158,11,0.10)",  icon: RefreshCw },
  pending: { label: "Не синхронизировано", color: "#ef4444", bg: "rgba(239,68,68,0.10)",   icon: CloudOff  },
  synced:  { label: "Синхронизировано",    color: "#22c55e", bg: "rgba(34,197,94,0.10)",   icon: Wifi     },
};

// ─── Language sheet ───────────────────────────────────────────────────────────

function LangSheet({ current, onChange, onClose }: {
  current: string;
  onChange: (v: string) => void;
  onClose: () => void;
}) {
  const portal = document.getElementById("app-portal");
  if (!portal) return null;

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "absolute", inset: 0, zIndex: 200, pointerEvents: "auto",
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "flex-end",
    }}>
      <div style={{
        width: "100%", background: "rgba(248,249,252,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: "24px 24px 0 0", padding: "16px 20px 40px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", fontFamily: "Inter, sans-serif",
        animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>Язык интерфейса</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", outline: "none", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {LANG_OPTIONS.map(lang => {
            const active = current === lang;
            return (
              <button key={lang} onClick={() => { onChange(lang); onClose(); }} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 14, border: "none", cursor: "pointer",
                background: active ? "rgba(99,102,241,0.08)" : "rgba(0,0,0,0.04)",
                fontFamily: "Inter, sans-serif", outline: "none",
              }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{lang}</span>
                {active && (
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: "linear-gradient(135deg,#6366f1,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={13} strokeWidth={2.5} color="#fff" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    portal,
  );
}

// ─── Graphics sheet ───────────────────────────────────────────────────────────

function GraphicsSheet({ current, onChange, onClose }: {
  current: GraphicsQuality;
  onChange: (v: GraphicsQuality) => void;
  onClose: () => void;
}) {
  const portal = document.getElementById("app-portal");
  if (!portal) return null;

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "absolute", inset: 0, zIndex: 200, pointerEvents: "auto",
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "flex-end",
    }}>
      <div style={{
        width: "100%", background: "rgba(248,249,252,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: "24px 24px 0 0", padding: "16px 20px 40px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", fontFamily: "Inter, sans-serif",
        animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>Графика</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", outline: "none", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {GRAPHICS_OPTIONS.map(({ value, label }) => {
            const active = current === value;
            return (
              <button key={value} onClick={() => { onChange(value); onClose(); }} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "14px 16px", borderRadius: 14, border: "none", cursor: "pointer",
                background: active ? "rgba(99,102,241,0.08)" : "rgba(0,0,0,0.04)",
                fontFamily: "Inter, sans-serif", outline: "none",
              }}>
                <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>{label}</span>
                {active && (
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: "linear-gradient(135deg,#6366f1,#818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={13} strokeWidth={2.5} color="#fff" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    portal,
  );
}

// ─── About sheet ──────────────────────────────────────────────────────────────

function AboutSheet({ onClose }: { onClose: () => void }) {
  const portal = document.getElementById("app-portal");
  if (!portal) return null;

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "absolute", inset: 0, zIndex: 200, pointerEvents: "auto",
      background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "flex-end",
    }}>
      <div style={{
        width: "100%", background: "rgba(248,249,252,0.98)",
        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: "24px 24px 0 0", padding: "16px 20px 48px",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.15)", fontFamily: "Inter, sans-serif",
        animation: "sheetUp 0.28s cubic-bezier(0.22,1,0.36,1) forwards",
      }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
          <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>О приложении</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", outline: "none", display: "flex" }}><X size={18} /></button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: 20, background: "linear-gradient(135deg,#FF6B00,#FF9A00)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(255,107,0,0.30)" }}>
            <span style={{ fontSize: 28 }}>🛣️</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>Твой калькулятор</span>
          <span style={{ fontSize: 13, color: "#9ca3af" }}>Версия 1.0.0 (build 42)</span>
        </div>
        <div style={{ background: "rgba(0,0,0,0.04)", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {([
            { label: "Разработка", value: "urbanstudio" },
            { label: "Поддержка", value: "kkabenyuk@gmail.com", href: "mailto:kkabenyuk@gmail.com" },
            { label: "Telegram", value: "@alekseevich47", href: "https://t.me/alekseevich47" },
          ] as const).map(({ label, value, href }) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 13, color: "#6b7280", flexShrink: 0 }}>{label}</span>
              {href ? (
                <a
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                  style={{ fontSize: 13, fontWeight: 500, color: "#FF6B00", textDecoration: "none", textAlign: "right", wordBreak: "break-all" }}
                >
                  {value}
                </a>
              ) : (
                <span style={{ fontSize: 13, fontWeight: 500, color: "#111827", textAlign: "right" }}>{value}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>,
    portal,
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const navigate = useNavigate();
  const syncStatus = useSyncStatus();
  const shifts = useShifts();
  const graphics = useGraphicsQuality();

  const [period, setPeriod] = useState<Period>("month");
  const [language, setLanguage] = useState("Русский");
  const [showLang, setShowLang] = useState(false);
  const [showGraphics, setShowGraphics] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [userName, setUserName] = useState(() => getCurrentUserFullName());

  useEffect(() => {
    const sync = () => setUserName(getCurrentUserFullName());
    sync();
    return subscribeAuthStore(sync);
  }, []);

  const displayName = userName || "Пользователь";
  const stats = computeUserStats(shifts, displayName, period);
  const alltime = computeUserStats(shifts, displayName, "alltime");

  function handleSync() {
    if (syncStatus === "synced") return;
    void (async () => {
      await syncNow();
      const err = peekSyncSnapshot().lastError;
      if (err) window.alert(err);
    })();
  }

  const sync = SYNC_CFG[syncStatus];
  const SyncIcon = sync.icon;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      {/* Header */}
      <div style={{ padding: "52px 20px 14px", borderBottom: "1px solid rgba(0,0,0,0.06)", flexShrink: 0, fontFamily: "Inter, sans-serif" }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em" }}>Профиль</h1>
      </div>

      <div style={{ padding: "16px 16px 110px", display: "flex", flexDirection: "column", gap: 12, fontFamily: "Inter, sans-serif" }}>

        {/* Avatar + name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.68)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 18, padding: "16px 18px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "linear-gradient(135deg,#FF6B00,#FF9A00)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 4px 14px rgba(255,107,0,0.28)" }}>
            <User size={24} strokeWidth={1.8} color="white" />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>{displayName}</p>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#9ca3af" }}>Оператор разметки</p>
          </div>
        </div>

        {/* Sync status */}
        <button onClick={handleSync} style={{
          display: "flex", alignItems: "center", gap: 12,
          background: sync.bg,
          border: `1px solid ${sync.color}28`,
          borderRadius: 16, padding: "13px 16px",
          cursor: syncStatus === "synced" ? "default" : "pointer",
          outline: "none", fontFamily: "Inter, sans-serif", width: "100%",
          transition: "background 0.2s",
        }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: `${sync.color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <SyncIcon size={18} strokeWidth={1.8} color={sync.color}
              style={syncStatus === "syncing" ? { animation: "spin 1s linear infinite" } : undefined}
            />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", letterSpacing: "-0.02em" }}>Статус подключения</div>
            <div style={{ fontSize: 12, color: sync.color, fontWeight: 500, marginTop: 1 }}>{sync.label}</div>
          </div>
          {syncStatus !== "synced" && (
            <span style={{ fontSize: 11, color: sync.color, fontWeight: 600, padding: "4px 10px", borderRadius: 8, background: `${sync.color}15` }}>
              {syncStatus === "offline" ? "Подключиться" : syncStatus === "pending" ? "Синхронизировать" : "..."}
            </span>
          )}
        </button>

        {/* Stats block */}
        <div style={{ background: "rgba(255,255,255,0.68)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 18, padding: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {/* All-time total */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>Заработано за всё время</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#059669", letterSpacing: "-0.04em" }}>
              {fmt(alltime.earned)}
            </div>
          </div>

          {/* Period switcher */}
          <div style={{ display: "flex", background: "rgba(0,0,0,0.05)", borderRadius: 10, padding: 3, marginBottom: 14 }}>
            {PERIOD_LABELS.map(({ key, label }) => (
              <button key={key} onClick={() => setPeriod(key)} style={{
                flex: 1, height: 30, borderRadius: 8, border: "none",
                background: period === key ? "#fff" : "transparent",
                boxShadow: period === key ? "0 1px 6px rgba(0,0,0,0.10)" : "none",
                fontSize: 12, fontWeight: period === key ? 600 : 500,
                color: period === key ? "#111827" : "#9ca3af",
                cursor: "pointer", fontFamily: "Inter, sans-serif", outline: "none",
                transition: "background 0.15s, box-shadow 0.15s, color 0.15s",
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Period stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { label: "Заработано", value: fmt(stats.earned),        color: "#059669" },
              { label: "Объём",     value: fmtVol(stats.volume),      color: "#6366f1" },
              { label: "Смены",     value: String(stats.shifts),      color: "#f59e0b" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ background: "rgba(0,0,0,0.03)", borderRadius: 12, padding: "10px 10px 8px" }}>
                <div style={{ fontSize: 9, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 5 }}>{label}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Settings */}
        <div style={{ background: "rgba(255,255,255,0.68)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.6)", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
          {/* Language */}
          <button onClick={() => setShowLang(true)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            background: "none", border: "none", borderBottom: "1px solid rgba(0,0,0,0.05)",
            cursor: "pointer", fontFamily: "Inter, sans-serif", outline: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(99,102,241,0.10)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Globe size={15} strokeWidth={2} color="#6366f1" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>Язык</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{language}</span>
              <ChevronRight size={14} strokeWidth={2} color="#c4c9d4" />
            </div>
          </button>

          {/* Graphics */}
          <button onClick={() => setShowGraphics(true)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            background: "none", border: "none", borderBottom: "1px solid rgba(0,0,0,0.05)",
            cursor: "pointer", fontFamily: "Inter, sans-serif", outline: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(245,158,11,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={15} strokeWidth={2} color="#f59e0b" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>Графика</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>{graphics === "low" ? "Низкая" : "Высокая"}</span>
              <ChevronRight size={14} strokeWidth={2} color="#c4c9d4" />
            </div>
          </button>

          {/* About */}
          <button onClick={() => setShowAbout(true)} style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px",
            background: "none", border: "none",
            cursor: "pointer", fontFamily: "Inter, sans-serif", outline: "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Info size={15} strokeWidth={2} color="#6b7280" />
              </div>
              <span style={{ fontSize: 14, fontWeight: 500, color: "#111827" }}>О приложении</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 13, color: "#9ca3af" }}>v1.0.0</span>
              <ChevronRight size={14} strokeWidth={2} color="#c4c9d4" />
            </div>
          </button>
        </div>

        {/* Logout */}
        <button onClick={() => { clearSession(); navigate("/"); }} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          height: 48, borderRadius: 14, border: "1px solid rgba(239,68,68,0.2)",
          background: "rgba(254,242,242,0.7)", cursor: "pointer", outline: "none",
          fontFamily: "Inter, sans-serif", color: "#ef4444", fontSize: 14, fontWeight: 600,
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        }}>
          <LogOut size={16} strokeWidth={2} />
          Выйти
        </button>

        <div style={{ height: 8, flexShrink: 0 }} />
      </div>

      {showLang  && <LangSheet current={language} onChange={setLanguage} onClose={() => setShowLang(false)} />}
      {showGraphics && (
        <GraphicsSheet
          current={graphics}
          onChange={setGraphicsQuality}
          onClose={() => setShowGraphics(false)}
        />
      )}
      {showAbout && <AboutSheet onClose={() => setShowAbout(false)} />}
    </div>
  );
}
