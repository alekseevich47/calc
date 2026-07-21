import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Eye, EyeOff, Calculator } from "lucide-react";
import { GlobalStyles } from "../components/shared";
import { authFailureMessage, isAuthenticated, loginWithPassword } from "../lib/session";
import { syncNow } from "../lib/sync";

export default function AuthPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (isAuthenticated()) {
    return <Navigate to="/home" replace />;
  }

  const canSubmit = login.trim().length > 0 && password.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || loading) return;
    setLoading(true);
    setError("");
    try {
      await loginWithPassword(login, password, remember);
      void syncNow();
      navigate("/home");
    } catch (err) {
      setError(authFailureMessage(err, "Неверный логин или пароль"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      height: "100dvh", maxHeight: "100dvh", overflow: "hidden",
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(160deg, #f0f4ff 0%, #fdf9f5 55%, #fff7ed 100%)",
      fontFamily: "Inter, sans-serif", position: "relative",
      padding: "0 24px", boxSizing: "border-box",
    }}>
      <GlobalStyles />
      <style>{`
        .auth-input {
          width: 100%; height: 48px;
          background: rgba(255,255,255,0.72);
          border: 1px solid rgba(0,0,0,0.09); border-radius: 14px;
          padding: 0 16px; font-size: 15px; font-weight: 400; color: #111827;
          font-family: Inter, sans-serif; outline: none;
          transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
          box-sizing: border-box; -webkit-appearance: none;
        }
        .auth-input::placeholder { color: #b0b7c3; }
        .auth-input:focus {
          border-color: rgba(255,107,0,0.55);
          box-shadow: 0 0 0 3px rgba(255,107,0,0.10);
          background: rgba(255,255,255,0.92);
        }
        .auth-btn {
          width: 100%; height: 50px; border-radius: 14px; border: none;
          background: linear-gradient(135deg, #FF6B00 0%, #FF9A00 100%);
          color: #fff; font-size: 15px; font-weight: 600;
          font-family: Inter, sans-serif; letter-spacing: -0.01em; cursor: pointer;
          box-shadow: 0 6px 20px rgba(255,107,0,0.32), 0 1px 4px rgba(255,107,0,0.18);
          transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s; outline: none;
          -webkit-tap-highlight-color: transparent;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .auth-btn:active { transform: scale(0.97); box-shadow: 0 3px 10px rgba(255,107,0,0.28); }
        .auth-btn:disabled { opacity: 0.7; cursor: not-allowed; }
        .auth-link {
          display: block; text-align: center; margin-top: 16px;
          font-size: 14px; font-weight: 500; color: #FF6B00;
          text-decoration: none; -webkit-tap-highlight-color: transparent;
        }
        .checkbox-box {
          width: 20px; height: 20px; border-radius: 6px;
          border: 1.5px solid rgba(0,0,0,0.15); background: rgba(255,255,255,0.8);
          flex-shrink: 0; display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: background 0.15s, border-color 0.15s;
        }
        .checkbox-box.checked {
          background: linear-gradient(135deg, #FF6B00 0%, #FF9A00 100%);
          border-color: transparent;
        }
        @keyframes authFadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
      `}</style>

      <div style={{ position: "absolute", top: -80, right: -60, width: 260, height: 260, background: "radial-gradient(circle, rgba(255,154,0,0.13) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -60, left: -80, width: 300, height: 300, background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />

      <form onSubmit={(e) => { void handleSubmit(e); }} style={{ width: "100%", maxWidth: 330, display: "flex", flexDirection: "column", gap: 0, animation: "authFadeUp 0.4s ease forwards", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28, gap: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #FF6B00 0%, #FF9A00 100%)", boxShadow: "0 8px 24px rgba(255,107,0,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calculator size={26} strokeWidth={1.8} color="#fff" />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em", lineHeight: 1.2 }}>
              Твой калькулятор
            </h1>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#9ca3af", fontWeight: 400 }}>
              Войдите, чтобы продолжить
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: "0.01em", textTransform: "uppercase" }}>Логин</label>
            <input className="auth-input" type="text" placeholder="Введите логин" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="off" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", letterSpacing: "0.01em", textTransform: "uppercase" }}>Пароль</label>
            <div style={{ position: "relative" }}>
              <input className="auth-input" type={showPassword ? "text" : "password"} placeholder="Введите пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{ paddingRight: 48 } as React.CSSProperties} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", color: "#9ca3af", outline: "none" }}>
                {showPassword ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#ef4444", fontWeight: 500 }}>{error}</p>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22, cursor: "pointer" }} onClick={() => setRemember((v) => !v)}>
          <div className={`checkbox-box${remember ? " checked" : ""}`}>
            {remember && (
              <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
          <span style={{ fontSize: 14, color: "#374151", fontWeight: 500, userSelect: "none" }}>Запомнить меня</span>
        </div>

        <button type="submit" className="auth-btn" disabled={loading || !canSubmit}>
          {loading ? (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
                <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
                <path d="M9 2a7 7 0 0 1 7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Вход...
            </>
          ) : "Войти"}
        </button>

        <Link to="/register" className="auth-link">Зарегистрироваться</Link>
      </form>
    </div>
  );
}
