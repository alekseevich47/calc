import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { Eye, EyeOff, Calculator } from "lucide-react";
import { authFailureMessage, isAuthenticated, registerWithPassword } from "../lib/session";
import { syncNow } from "../lib/sync";

const MIN_PASSWORD = 6;

type FieldErrors = {
  email?: string;
  password?: string;
  surname?: string;
  name?: string;
};

function validateFields(input: {
  email: string;
  password: string;
  surname: string;
  name: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  const email = input.email.trim();
  if (!email || !email.includes("@")) {
    errors.email = "Укажите почту с символом @";
  }
  if (input.password.length < MIN_PASSWORD) {
    errors.password = `Минимум ${MIN_PASSWORD} символов`;
  }
  if (!input.surname.trim()) {
    errors.surname = "Введите фамилию";
  }
  if (!input.name.trim()) {
    errors.name = "Введите имя";
  }
  return errors;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [surname, setSurname] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  if (isAuthenticated()) {
    return <Navigate to="/home" replace />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const nextErrors = validateFields({ email, password, surname, name });
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setLoading(true);
    setError("");
    try {
      await registerWithPassword({ email, password, surname, name });
      void syncNow();
      navigate("/home");
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "";
      setError(
        authFailureMessage(
          err,
          msg.includes("email") || msg.includes("unique")
            ? "Этот email уже зарегистрирован"
            : "Не удалось зарегистрироваться",
        ),
      );
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
        .auth-input.auth-input-error {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239,68,68,0.12);
        }
        .auth-input.auth-input-error:focus {
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239,68,68,0.16);
        }
        .auth-field-hint {
          margin: 0; font-size: 12px; font-weight: 500; color: #ef4444;
          line-height: 1.3;
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
      `}</style>

      <div style={{ position: "absolute", top: -80, right: -60, width: 260, height: 260, background: "radial-gradient(circle, rgba(255,154,0,0.13) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -60, left: -80, width: 300, height: 300, background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />

      <form
        noValidate
        onSubmit={(e) => { void handleSubmit(e); }}
        style={{
          width: "100%", maxWidth: 330, display: "flex", flexDirection: "column", gap: 0,
          animation: "authFadeUp 0.4s ease forwards", position: "relative",
          maxHeight: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 22, gap: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "linear-gradient(135deg, #FF6B00 0%, #FF9A00 100%)", boxShadow: "0 8px 24px rgba(255,107,0,0.30)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Calculator size={26} strokeWidth={1.8} color="#fff" />
          </div>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827", letterSpacing: "-0.04em", lineHeight: 1.2 }}>
              Регистрация
            </h1>
            <p style={{ margin: "5px 0 0", fontSize: 13, color: "#9ca3af", fontWeight: 400 }}>
              Создайте аккаунт, чтобы продолжить
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: fieldErrors.email ? "#ef4444" : "#374151", letterSpacing: "0.01em", textTransform: "uppercase" }}>Почта</label>
            <input
              className={`auth-input${fieldErrors.email ? " auth-input-error" : ""}`}
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              autoComplete="email"
              autoCapitalize="off"
            />
            {fieldErrors.email && <p className="auth-field-hint">{fieldErrors.email}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: fieldErrors.password ? "#ef4444" : "#374151", letterSpacing: "0.01em", textTransform: "uppercase" }}>Пароль</label>
            <div style={{ position: "relative" }}>
              <input
                className={`auth-input${fieldErrors.password ? " auth-input-error" : ""}`}
                type={showPassword ? "text" : "password"}
                placeholder={`Минимум ${MIN_PASSWORD} символов`}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: undefined }));
                }}
                autoComplete="new-password"
                style={{ paddingRight: 48 } as React.CSSProperties}
              />
              <button type="button" onClick={() => setShowPassword((v) => !v)} style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", color: "#9ca3af", outline: "none" }}>
                {showPassword ? <EyeOff size={18} strokeWidth={1.8} /> : <Eye size={18} strokeWidth={1.8} />}
              </button>
            </div>
            {fieldErrors.password && <p className="auth-field-hint">{fieldErrors.password}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: fieldErrors.surname ? "#ef4444" : "#374151", letterSpacing: "0.01em", textTransform: "uppercase" }}>Фамилия</label>
            <input
              className={`auth-input${fieldErrors.surname ? " auth-input-error" : ""}`}
              type="text"
              placeholder="Фамилия"
              value={surname}
              onChange={(e) => {
                setSurname(e.target.value);
                if (fieldErrors.surname) setFieldErrors((prev) => ({ ...prev, surname: undefined }));
              }}
              autoComplete="family-name"
            />
            {fieldErrors.surname && <p className="auth-field-hint">{fieldErrors.surname}</p>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: fieldErrors.name ? "#ef4444" : "#374151", letterSpacing: "0.01em", textTransform: "uppercase" }}>Имя</label>
            <input
              className={`auth-input${fieldErrors.name ? " auth-input-error" : ""}`}
              type="text"
              placeholder="Имя"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (fieldErrors.name) setFieldErrors((prev) => ({ ...prev, name: undefined }));
              }}
              autoComplete="given-name"
            />
            {fieldErrors.name && <p className="auth-field-hint">{fieldErrors.name}</p>}
          </div>
        </div>

        {error && (
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#ef4444", fontWeight: 500 }}>{error}</p>
        )}

        <button type="submit" className="auth-btn" disabled={loading}>
          {loading ? (
            <>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ animation: "spin 0.9s linear infinite", flexShrink: 0 }}>
                <circle cx="9" cy="9" r="7" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
                <path d="M9 2a7 7 0 0 1 7 7" stroke="white" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Регистрация...
            </>
          ) : "Зарегистрироваться"}
        </button>

        <Link to="/" className="auth-link">Уже есть аккаунт? Войти</Link>
      </form>
    </div>
  );
}
