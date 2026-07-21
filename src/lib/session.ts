import { isPocketBaseConfigured, pb } from "./pocketbase";

const AUTH_KEY = "calc_auth_stub";
const PB_SESSION_KEY = "pocketbase_auth_session";

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
}

/** `users.full_name` текущего пользователя (PB) или stub-имя. */
export function getCurrentUserFullName(): string {
  const rec = pb.authStore.record as { full_name?: string; name?: string } | null;
  if (rec?.full_name) return String(rec.full_name);
  if (rec?.name) return String(rec.name);
  return "Иванов А.В.";
}

/** Логин: PB `authWithPassword` (email/login) или stub без сети. */
export async function loginWithPassword(
  login: string,
  password: string,
  remember: boolean,
): Promise<void> {
  if (isPocketBaseConfigured()) {
    await pb.collection("users").authWithPassword(login.trim(), password);
    if (!remember) {
      const token = pb.authStore.token;
      const record = pb.authStore.record;
      sessionStorage.setItem(PB_SESSION_KEY, JSON.stringify({ token, record }));
      localStorage.removeItem("pocketbase_auth");
    } else {
      sessionStorage.removeItem(PB_SESSION_KEY);
    }
    setSession(remember);
    return;
  }
  setSession(remember);
}
