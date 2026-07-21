const AUTH_KEY = "calc_auth_stub";

/** Временная заглушка сессии до PocketBase (Блок 4). */
export function isAuthenticated(): boolean {
  return (
    localStorage.getItem(AUTH_KEY) === "1" ||
    sessionStorage.getItem(AUTH_KEY) === "1"
  );
}

export function setSession(remember: boolean): void {
  clearSession();
  if (remember) localStorage.setItem(AUTH_KEY, "1");
  else sessionStorage.setItem(AUTH_KEY, "1");
}

export function clearSession(): void {
  localStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(AUTH_KEY);
}
