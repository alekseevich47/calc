import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { isAuthenticated, subscribeAuthStore } from "../lib/session";

/** Guard: без локальной сессии — на логин. Реактивен к clearSession / authRefresh. */
export default function RequireAuth() {
  const [, setTick] = useState(0);
  useEffect(() => subscribeAuthStore(() => setTick((n) => n + 1)), []);

  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
