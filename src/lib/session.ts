import { isPocketBaseConfigured, pb } from "./pocketbase";
import { clearUserScopedData, ensureUserDataScope } from "./db";

const AUTH_KEY = "calc_auth_stub";
const PB_SESSION_KEY = "pocketbase_auth_session";

export type UserNameFields = {
  surname?: string | null;
  name?: string | null;
  id?: string;
  email?: string | null;
};

/** Отображаемое имя: «Фамилия Имя» (без fallback на PB id). */
export function formatUserName(u: UserNameFields | null | undefined): string {
  if (!u) return "";
  const parts = [u.surname, u.name]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "";
}

/** Похоже на PocketBase id (15 символов) — не показывать как имя. */
export function looksLikePbId(value: string): boolean {
  return /^[a-z0-9]{15}$/i.test(value.trim());
}

/** Локально сохранённая PB-сессия (token + user id), в т.ч. с просроченным JWT. */
export function hasLocalPbSession(): boolean {
  const token = String(pb.authStore.token ?? "").trim();
  const id = String(pb.authStore.record?.id ?? "").trim();
  return Boolean(token && id);
}

function statusOf(err: unknown): number {
  if (err && typeof err === "object" && "status" in err) {
    return Number((err as { status?: number }).status) || 0;
  }
  return 0;
}

/** 401/403 — сессия отвергнута сервером; status 0 — сеть/офлайн. */
export function isAuthRejected(err: unknown): boolean {
  const status = statusOf(err);
  return status === 401 || status === 403;
}

export function isNetworkError(err: unknown): boolean {
  const status = statusOf(err);
  if (status === 0) return true;
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /network|fetch|offline|failed to fetch|load failed/i.test(msg);
}

/** Текст ошибки логина/регистрации для UI. */
export function authFailureMessage(err: unknown, fallback: string): string {
  if (isNetworkError(err)) {
    return "Нет сети. Первый вход — при подключении; дальше приложение работает офлайн.";
  }
  return fallback;
}

/** Восстановить PB-сессию из sessionStorage (режим без «Запомнить»). */
export function restoreSession(): void {
  // Старый stub-флаг не должен маскировать отсутствие PB-сессии
  if (isPocketBaseConfigured()) {
    clearStubSession();
  }
  // Уже есть запись в authStore (localStorage) — даже с просроченным JWT
  if (!isPocketBaseConfigured() || hasLocalPbSession()) return;
  try {
    const raw = sessionStorage.getItem(PB_SESSION_KEY);
    if (!raw) return;
    const { token, record } = JSON.parse(raw) as { token: string; record: unknown };
    if (token && record) {
      pb.authStore.save(token, record as never);
      localStorage.removeItem("pocketbase_auth");
    }
  } catch {
    sessionStorage.removeItem(PB_SESSION_KEY);
  }
}

/**
 * Auth для UI/guard: после первого входа пускаем по локальной сессии
 * (JWT может быть просрочен офлайн — серверные вызовы обновят токен при online).
 */
export function isAuthenticated(): boolean {
  if (isPocketBaseConfigured()) {
    return hasLocalPbSession();
  }
  return (
    localStorage.getItem(AUTH_KEY) === "1" ||
    sessionStorage.getItem(AUTH_KEY) === "1"
  );
}

export function setSession(remember: boolean): void {
  clearStubSession();
  if (remember) localStorage.setItem(AUTH_KEY, "1");
  else sessionStorage.setItem(AUTH_KEY, "1");
}

function clearStubSession(): void {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}

export function clearSession(): void {
  clearStubSession();
  sessionStorage.removeItem(PB_SESSION_KEY);
  pb.authStore.clear();
  void clearUserScopedData();
}

async function scopeAfterAuth(): Promise<void> {
  const id = String(pb.authStore.record?.id ?? "").trim();
  if (id) await ensureUserDataScope(id);
  await ensureAuthProfile();
}

/**
 * Обновить JWT на сервере перед sync/API.
 * Офлайн / сетевой сбой — false (локальную сессию не трогаем).
 * 401/403 — clearSession, false.
 */
export async function ensureServerSession(): Promise<boolean> {
  if (!isPocketBaseConfigured() || !hasLocalPbSession()) return false;
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;

  if (pb.authStore.isValid) return true;

  try {
    await pb.collection("users").authRefresh();
    return pb.authStore.isValid;
  } catch (err) {
    if (isAuthRejected(err)) {
      clearSession();
      return false;
    }
    return false;
  }
}

/**
 * Подтянуть актуальный users-record (surname/name).
 * Офлайн — no-op (имя из кэша authStore). Онлайн — authRefresh; 401 → logout.
 */
export async function ensureAuthProfile(): Promise<void> {
  if (!isPocketBaseConfigured() || !hasLocalPbSession()) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const token = pb.authStore.token;
  const id = String(pb.authStore.record?.id ?? "").trim();
  if (!token || !id) return;

  try {
    await pb.collection("users").authRefresh();
  } catch (err) {
    if (isAuthRejected(err)) {
      clearSession();
      return;
    }
    /* сеть — оставляем локальную сессию */
    return;
  }

  const rec = pb.authStore.record as UserNameFields | null;
  if (formatUserName(rec)) return;

  try {
    const full = await pb.collection("users").getOne(id);
    pb.authStore.save(pb.authStore.token || token, full);
  } catch {
    /* офлайн / нет прав — оставляем как есть */
  }
}

/** `users.surname` + `users.name` текущего пользователя (PB) или stub-имя. */
export function getCurrentUserFullName(): string {
  if (!isPocketBaseConfigured()) return "Иванов А.В.";
  const rec = pb.authStore.record as UserNameFields | null;
  const formatted = formatUserName(rec);
  if (formatted) return formatted;
  const email = String(rec?.email ?? "").trim();
  if (email) return email;
  return "";
}

/** Подписка на смену authStore (имя после authRefresh и т.п.). */
export function subscribeAuthStore(onChange: () => void): () => void {
  return pb.authStore.onChange(() => {
    onChange();
  });
}

function persistRemember(remember: boolean): void {
  if (!remember) {
    const token = pb.authStore.token;
    const record = pb.authStore.record;
    sessionStorage.setItem(PB_SESSION_KEY, JSON.stringify({ token, record }));
    localStorage.removeItem("pocketbase_auth");
  } else {
    sessionStorage.removeItem(PB_SESSION_KEY);
  }
  setSession(remember);
}

/** Логин: PB `authWithPassword` (email/login) или stub без сети. */
export async function loginWithPassword(
  login: string,
  password: string,
  remember: boolean,
): Promise<void> {
  if (isPocketBaseConfigured()) {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      throw Object.assign(new Error("offline"), { status: 0 });
    }
    await pb.collection("users").authWithPassword(login.trim(), password);
    await scopeAfterAuth();
    persistRemember(remember);
    return;
  }
  setSession(remember);
}

/** Регистрация: create + сразу вход. Без email-подтверждения. */
export async function registerWithPassword(input: {
  email: string;
  password: string;
  surname: string;
  name: string;
  remember?: boolean;
}): Promise<void> {
  const email = input.email.trim();
  const surname = input.surname.trim();
  const name = input.name.trim();
  const remember = input.remember ?? true;

  if (!isPocketBaseConfigured()) {
    setSession(remember);
    return;
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw Object.assign(new Error("offline"), { status: 0 });
  }

  await pb.collection("users").create({
    email,
    password: input.password,
    passwordConfirm: input.password,
    surname,
    name,
  });
  await pb.collection("users").authWithPassword(email, input.password);
  await scopeAfterAuth();
  persistRemember(remember);
}
