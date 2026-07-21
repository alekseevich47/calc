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

/** Восстановить PB-сессию из sessionStorage (режим без «Запомнить»). */
export function restoreSession(): void {
  // Старый stub-флаг не должен маскировать отсутствие PB-сессии
  if (isPocketBaseConfigured()) {
    clearStubSession();
  }
  if (!isPocketBaseConfigured() || pb.authStore.isValid) return;
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

/** Auth: PocketBase если настроен, иначе локальная заглушка. */
export function isAuthenticated(): boolean {
  if (isPocketBaseConfigured()) {
    return pb.authStore.isValid;
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
 * Подтянуть актуальный users-record (surname/name).
 * Нужно на iOS/PWA: в authStore иногда лежит урезанный кэш без кастомных полей → вместо имени показывался id.
 */
export async function ensureAuthProfile(): Promise<void> {
  if (!isPocketBaseConfigured() || !pb.authStore.isValid) return;
  const token = pb.authStore.token;
  const id = String(pb.authStore.record?.id ?? "").trim();
  if (!token || !id) return;

  try {
    await pb.collection("users").authRefresh();
  } catch {
    /* токен мог протухнуть — ниже попробуем getOne при валидной сессии */
  }

  const rec = pb.authStore.record as UserNameFields | null;
  if (formatUserName(rec)) return;

  try {
    const full = await pb.collection("users").getOne(id);
    pb.authStore.save(token, full);
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
