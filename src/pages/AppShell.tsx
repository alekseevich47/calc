import { useRef, useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import { createPortal } from "react-dom";
import { X, Check, Home, List, User, Plus, Calculator, Wifi, WifiOff, RefreshCw, CloudOff } from "lucide-react";
import { BottomNav, GlobalStyles, type SyncStatus } from "../components/shared";
import { peekSyncSnapshot, syncNow, useSyncStatus } from "../lib/sync";

// ─── Types shared with pages ──────────────────────────────────────────────────

export interface QuickRow {
  location: string;
  markingNum: string;
  markingType: string;
  volume: number;
  material: string;
  tariff: number;
}

export interface ShellContext {
  phoneRef: React.RefObject<HTMLDivElement | null>;
  registerAddRow: (fn: (row: QuickRow) => void) => void;
  isDesktop: boolean;
}

// ─── Responsive hook ──────────────────────────────────────────────────────────

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isDesktop;
}

// ─── Text parser ──────────────────────────────────────────────────────────────

function parseQuickText(text: string): QuickRow {
  const t = text.toLowerCase();
  let location = "";
  if (t.includes("трасса")) location = "Трасса";
  else if (t.includes("населённый") || t.includes("населенный") || /\bнп\b/.test(t)) location = "Населённый пункт";

  let markingNum = "";
  const mNum = text.match(/\b(стоп-линия|стоп\s*линия|1\.[1256])\b/i);
  if (mNum) markingNum = /стоп/i.test(mNum[1]) ? "Стоп-линия" : mNum[1];

  let volume = 0;
  const volMatch = text.match(/(\d+[\.,]?\d*)\s*м/i);
  if (volMatch) volume = parseFloat(volMatch[1].replace(",", "."));

  let material = "";
  if (t.includes("холодный") || t.includes("пластик")) material = "Холодный пластик";
  else if (t.includes("краска") || t.includes("краск")) material = "Краска";

  let tariff = 0;
  const tariffKw = text.match(/тариф\s*(\d+)/i);
  if (tariffKw) {
    tariff = parseInt(tariffKw[1]);
  } else {
    const nums = [...text.matchAll(/\b(\d+)\b/g)].map((m) => parseInt(m[1]));
    const candidates = nums.filter((n) => n !== volume && n > 0 && n < 10000);
    if (candidates.length > 0) tariff = candidates[candidates.length - 1];
  }
  return { location, markingNum, markingType: "", volume, material, tariff };
}

// ─── Quick Input (mobile = bottom sheet, desktop = centered modal) ────────────

const FIELD_LABELS: { key: keyof QuickRow; label: string }[] = [
  { key: "location",   label: "Н.П. / Трасса" },
  { key: "markingNum", label: "№ разметки"    },
  { key: "volume",     label: "Объём"         },
  { key: "material",   label: "Материал"      },
  { key: "tariff",     label: "Тариф"         },
];

function QuickInputContent({ onClose, onAdd }: {
  onClose: () => void;
  onAdd: (row: QuickRow) => void;
}) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<QuickRow | null>(null);

  function handleAdd() {
    if (parsed) { onAdd(parsed); onClose(); }
  }

  return (
    <>
      <style>{`
        .qi-textarea {
          width: 100%; flex: 1; min-height: 100px;
          background: rgba(0,0,0,0.04);
          border: 1.5px solid rgba(0,0,0,0.09); border-radius: 14px;
          padding: 12px 14px; resize: none;
          font-size: 14px; line-height: 1.6; color: #111827;
          font-family: Inter, sans-serif;
          outline: none; box-sizing: border-box;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .qi-textarea:focus {
          border-color: rgba(255,107,0,0.5);
          box-shadow: 0 0 0 3px rgba(255,107,0,0.10);
          background: #fff;
        }
        .qi-textarea::placeholder { color: #b0b7c3; }
      `}</style>

      {/* Handle (mobile only styling) */}
      <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 0" }}>
        <div style={{ width: 36, height: 4, borderRadius: 99, background: "rgba(0,0,0,0.12)" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 12px", borderBottom: "1px solid rgba(0,0,0,0.07)", flexShrink: 0 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em" }}>Быстрый ввод текстом</h2>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#9ca3af", outline: "none", display: "flex" }}>
          <X size={18} strokeWidth={2} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          className="qi-textarea"
          placeholder="Введите данные произвольно..."
          value={text}
          onChange={(e) => { setText(e.target.value); setParsed(null); }}
          autoFocus
        />
        <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
          Пример: <span style={{ color: "#6b7280" }}>Трасса, 1.1, 150м., краска, тариф 80</span>
        </p>
        <button
          onClick={() => setParsed(parseQuickText(text))}
          disabled={!text.trim()}
          style={{
            height: 44, borderRadius: 12, border: "none",
            background: text.trim() ? "linear-gradient(135deg,#FF6B00,#FF9A00)" : "rgba(0,0,0,0.07)",
            color: text.trim() ? "#fff" : "#b0b7c3",
            fontSize: 14, fontWeight: 600, fontFamily: "Inter, sans-serif",
            cursor: text.trim() ? "pointer" : "not-allowed", outline: "none",
            boxShadow: text.trim() ? "0 4px 14px rgba(255,107,0,0.26)" : "none",
          }}
        >
          Разобрать
        </button>

        {parsed && (
          <div style={{ animation: "fadeUp 0.2s ease forwards" }}>
            <div style={{ background: "#fff", borderRadius: 14, border: "1px solid rgba(0,0,0,0.07)", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px 6px", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>Распознано</span>
              </div>
              {FIELD_LABELS.map(({ key, label }) => {
                const raw = parsed[key];
                const val = key === "volume" ? (raw ? `${raw} м²` : "") : key === "tariff" ? (raw ? `${raw} ₽` : "") : String(raw || "");
                const hasVal = !!raw && raw !== 0 && raw !== "";
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid rgba(0,0,0,0.04)" }}>
                    <span style={{ fontSize: 13, color: "#6b7280" }}>{label}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: hasVal ? 600 : 400, color: hasVal ? "#111827" : "#c4c9d4" }}>
                        {hasVal ? val : "не распознано"}
                      </span>
                      {hasVal
                        ? <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(5,150,105,0.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Check size={11} strokeWidth={2.5} color="#059669" />
                          </div>
                        : <div style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.05)", flexShrink: 0 }} />
                      }
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleAdd}
              style={{
                width: "100%", height: 46, borderRadius: 12, border: "none", marginTop: 10,
                background: "linear-gradient(135deg,#FF6B00,#FF9A00)",
                color: "#fff", fontSize: 14, fontWeight: 600,
                fontFamily: "Inter, sans-serif", cursor: "pointer", outline: "none",
                boxShadow: "0 4px 14px rgba(255,107,0,0.26)",
              }}
            >
              Добавить в таблицу
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// Mobile bottom sheet
function QuickInputSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (row: QuickRow) => void }) {
  const portal = document.getElementById("app-portal");
  if (!portal) return null;
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "absolute", inset: 0, zIndex: 200, pointerEvents: "auto",
      background: "rgba(0,0,0,0.38)", display: "flex", alignItems: "flex-end",
      animation: "fadeInBd 0.2s ease forwards",
    }}>
      <style>{`@keyframes fadeInBd { from { opacity:0; } to { opacity:1; } } @keyframes sheetUp { from { transform:translateY(100%); } to { transform:translateY(0); } }`}</style>
      <div style={{
        width: "100%", height: "70%",
        background: "rgba(248,249,252,0.98)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column",
        animation: "sheetUp 0.32s cubic-bezier(0.22,1,0.36,1) forwards",
        fontFamily: "Inter, sans-serif", overflow: "hidden",
      }}>
        <QuickInputContent onClose={onClose} onAdd={onAdd} />
      </div>
    </div>,
    portal,
  );
}

// Desktop centered modal
function QuickInputModal({ onClose, onAdd }: { onClose: () => void; onAdd: (row: QuickRow) => void }) {
  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.40)", display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "Inter, sans-serif",
    }}>
      <div style={{
        width: 460, maxHeight: "80vh",
        background: "rgba(248,249,252,0.99)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
        borderRadius: 24, boxShadow: "0 24px 80px rgba(0,0,0,0.20)",
        display: "flex", flexDirection: "column",
        animation: "fadeUp 0.22s ease forwards",
        overflow: "hidden",
      }}>
        <QuickInputContent onClose={onClose} onAdd={onAdd} />
      </div>
    </div>,
    document.body,
  );
}

// ─── Desktop sidebar ──────────────────────────────────────────────────────────

const SYNC_CFG: Record<SyncStatus, { label: string; color: string; icon: typeof Wifi }> = {
  offline: { label: "Офлайн",              color: "#9ca3af", icon: WifiOff   },
  syncing: { label: "Синхронизация...",    color: "#f59e0b", icon: RefreshCw },
  pending: { label: "Не синхронизировано", color: "#ef4444", icon: CloudOff  },
  synced:  { label: "Синхронизировано",    color: "#22c55e", icon: Wifi      },
};

const NAV_ITEMS = [
  { path: "/home",    label: "Главная", icon: Home },
  { path: "/history", label: "История", icon: List },
  { path: "/profile", label: "Профиль", icon: User },
];

const COLLAPSED_W = 64;
const EXPANDED_W  = 240;

function DesktopSidebar({ syncStatus, onSyncClick, onQuickInput, collapsed, onToggle }: {
  syncStatus: SyncStatus;
  onSyncClick: () => void;
  onQuickInput: () => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sync = SYNC_CFG[syncStatus];
  const SyncIcon = sync.icon;

  const w = collapsed ? COLLAPSED_W : EXPANDED_W;

  // Tooltip on hover for collapsed icons
  function IconBtn({ onClick, children, title, active, accent }: {
    onClick: () => void; children: React.ReactNode;
    title?: string; active?: boolean; accent?: boolean;
  }) {
    return (
      <button
        onClick={onClick}
        title={title}
        style={{
          width: collapsed ? 40 : "100%",
          height: 44,
          borderRadius: 12, border: "none", cursor: "pointer",
          display: "flex", alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
          padding: collapsed ? 0 : "0 14px",
          background: active
            ? "rgba(255,107,0,0.09)"
            : accent
            ? "linear-gradient(135deg,#FF6B00,#FF9A00)"
            : "transparent",
          fontFamily: "Inter, sans-serif", outline: "none",
          transition: "background 0.15s",
          flexShrink: 0,
          boxShadow: accent ? "0 4px 14px rgba(255,107,0,0.30)" : "none",
          marginLeft: collapsed ? "auto" : 0,
          marginRight: collapsed ? "auto" : 0,
        }}
        onMouseEnter={e => { if (!active && !accent) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.05)"; }}
        onMouseLeave={e => { if (!active && !accent) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        {children}
      </button>
    );
  }

  return (
    <aside style={{
      width: w, flexShrink: 0, height: "100vh", position: "sticky", top: 0,
      background: "rgba(255,255,255,0.75)",
      backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      borderRight: "1px solid rgba(0,0,0,0.07)",
      display: "flex", flexDirection: "column",
      boxShadow: "2px 0 24px rgba(0,0,0,0.05)",
      fontFamily: "Inter, sans-serif", zIndex: 10,
      transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
      overflow: "hidden",
    }}>

      {/* Logo row + toggle */}
      <div style={{
        padding: collapsed ? "24px 0 20px" : "24px 12px 20px",
        borderBottom: "1px solid rgba(0,0,0,0.06)",
        display: "flex", alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
        flexShrink: 0,
      }}>
        {/* App icon — always visible */}
        <div
          onClick={collapsed ? onToggle : undefined}
          style={{
            width: 38, height: 38, borderRadius: 12,
            background: "linear-gradient(135deg,#FF6B00,#FF9A00)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, boxShadow: "0 4px 12px rgba(255,107,0,0.28)",
            cursor: collapsed ? "pointer" : "default",
          }}
          title={collapsed ? "Развернуть панель" : undefined}
        >
          <Calculator size={18} strokeWidth={1.8} color="#fff" />
        </div>

        {/* Title + collapse button — only when expanded */}
        {!collapsed && (
          <>
            <div style={{ flex: 1, paddingLeft: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em", lineHeight: 1.15 }}>Твой</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", letterSpacing: "-0.03em", lineHeight: 1.15 }}>калькулятор</div>
            </div>
            <button
              onClick={onToggle}
              title="Свернуть панель"
              style={{
                width: 28, height: 28, borderRadius: 8, border: "1px solid rgba(0,0,0,0.09)",
                background: "rgba(0,0,0,0.04)", cursor: "pointer", outline: "none",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#9ca3af", flexShrink: 0, transition: "background 0.15s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.09)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)"; }}
            >
              {/* chevron-left */}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Nav */}
      <nav style={{
        padding: collapsed ? "16px 0" : "16px 12px",
        display: "flex", flexDirection: "column",
        alignItems: collapsed ? "center" : "stretch",
        gap: 4, flex: 1,
      }}>
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
          const active = pathname === path;
          return (
            <IconBtn key={path} onClick={() => navigate(path)} title={collapsed ? label : undefined} active={active}>
              <Icon size={18} strokeWidth={active ? 2.2 : 1.8} color={active ? "#FF6B00" : "#6b7280"} style={{ flexShrink: 0 }} />
              {!collapsed && (
                <>
                  <span style={{ fontSize: 14, fontWeight: active ? 600 : 500, color: active ? "#FF6B00" : "#374151", whiteSpace: "nowrap" }}>{label}</span>
                  {active && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#FF6B00", flexShrink: 0 }} />}
                </>
              )}
            </IconBtn>
          );
        })}
      </nav>

      {/* Bottom: sync + quick input */}
      <div style={{
        padding: collapsed ? "16px 0 28px" : "16px 12px 28px",
        borderTop: "1px solid rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column",
        alignItems: collapsed ? "center" : "stretch",
        gap: 10,
      }}>
        {/* Sync button */}
        <button
          onClick={onSyncClick}
          title={collapsed ? sync.label : undefined}
          style={{
            width: collapsed ? 40 : "100%",
            height: 40, borderRadius: 12, border: "none",
            cursor: syncStatus === "synced" ? "default" : "pointer",
            background: "rgba(0,0,0,0.04)",
            display: "flex", alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            gap: 10, padding: collapsed ? 0 : "0 14px",
            fontFamily: "Inter, sans-serif", outline: "none",
            marginLeft: collapsed ? "auto" : 0,
            marginRight: collapsed ? "auto" : 0,
          }}
        >
          <SyncIcon
            size={16} strokeWidth={1.8} color={sync.color}
            style={syncStatus === "syncing" ? { animation: "spin 1s linear infinite", flexShrink: 0 } : { flexShrink: 0 }}
          />
          {!collapsed && <span style={{ fontSize: 12, fontWeight: 500, color: sync.color, whiteSpace: "nowrap" }}>{sync.label}</span>}
        </button>

        {/* Quick input */}
        <button
          onClick={onQuickInput}
          title={collapsed ? "Быстрый ввод" : undefined}
          style={{
            width: collapsed ? 40 : "100%",
            height: 44, borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#FF6B00,#FF9A00)",
            display: "flex", alignItems: "center",
            justifyContent: "center",
            gap: collapsed ? 0 : 8,
            color: "#fff", fontSize: 14, fontWeight: 600,
            fontFamily: "Inter, sans-serif", outline: "none",
            boxShadow: "0 4px 16px rgba(255,107,0,0.32)",
            transition: "transform 0.12s",
            marginLeft: collapsed ? "auto" : 0,
            marginRight: collapsed ? "auto" : 0,
          }}
          onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = "scale(0.93)"; }}
          onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; }}
        >
          <Plus size={collapsed ? 20 : 18} strokeWidth={2.5} />
          {!collapsed && "Быстрый ввод"}
        </button>
      </div>
    </aside>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function AppShell() {
  const isDesktop = useIsDesktop();
  const phoneRef = useRef<HTMLDivElement>(null);
  const addRowRef = useRef<((row: QuickRow) => void) | null>(null);
  const [showQuickInput, setShowQuickInput] = useState(false);
  const syncStatus = useSyncStatus();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  function registerAddRow(fn: (row: QuickRow) => void) { addRowRef.current = fn; }
  function handleQuickAdd(row: QuickRow) { addRowRef.current?.(row); }
  function handleSync() {
    if (syncStatus === "synced") return;
    void (async () => {
      await syncNow();
      const err = peekSyncSnapshot().lastError;
      if (err) window.alert(err);
    })();
  }

  const context: ShellContext = { phoneRef, registerAddRow, isDesktop };

  // ── Desktop layout ──────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{
        height: "100dvh", maxHeight: "100dvh", overflow: "hidden", display: "flex",
        background: "linear-gradient(160deg,#f0f4ff 0%,#fdf9f5 55%,#fff7ed 100%)",
        fontFamily: "Inter, sans-serif",
        position: "relative",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
          * { box-sizing: border-box; }
          @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
          @keyframes spin   { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }
          ::-webkit-scrollbar { width: 4px; height: 4px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.12); border-radius: 99px; }
          input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
          input[type=number] { -moz-appearance: textfield; }
        `}</style>

        <DesktopSidebar
          syncStatus={syncStatus}
          onSyncClick={handleSync}
          onQuickInput={() => setShowQuickInput(true)}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
        />

        <main ref={phoneRef} style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
          <Outlet context={context} />
        </main>

        <div id="app-portal" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 90 }} />

        {showQuickInput && (
          <QuickInputModal
            onClose={() => setShowQuickInput(false)}
            onAdd={handleQuickAdd}
          />
        )}
      </div>
    );
  }

  // ── Mobile layout ───────────────────────────────────────────────────────────
  return (
    <div style={{
      height: "100dvh", maxHeight: "100dvh", overflow: "hidden",
      background: "linear-gradient(160deg, #f0f4ff 0%, #fdf9f5 55%, #fff7ed 100%)",
      fontFamily: "Inter, sans-serif",
      position: "relative",
      display: "flex", flexDirection: "column",
      overscrollBehavior: "none",
    }}>
      <GlobalStyles />
      <div style={{ position: "absolute", top: -80, right: -60, width: 260, height: 260, background: "radial-gradient(circle, rgba(255,154,0,0.11) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />

      <div
        ref={phoneRef}
        style={{
          flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
          WebkitOverflowScrolling: "touch", overscrollBehaviorY: "contain",
          position: "relative", display: "flex", flexDirection: "column",
        }}
      >
        <Outlet context={context} />
      </div>

      <BottomNav onFabClick={() => setShowQuickInput(true)} />

      {/* Вне скролла и выше BottomNav: иначе на iOS fixed-nav рисуется поверх sheet'ов */}
      <div id="app-portal" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }} />

      {showQuickInput && (
        <QuickInputSheet
          onClose={() => setShowQuickInput(false)}
          onAdd={handleQuickAdd}
        />
      )}
    </div>
  );
}
