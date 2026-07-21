import { Navigate, Outlet } from "react-router";
import { isAuthenticated } from "../lib/session";

/** Guard: без сессии — на логин. PB `authStore` или stub (`session.ts`). */
export default function RequireAuth() {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
