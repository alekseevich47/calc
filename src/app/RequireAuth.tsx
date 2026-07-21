import { Navigate, Outlet } from "react-router";
import { isAuthenticated } from "../lib/session";

/** Guard: без сессии — на логин. После Блока 4 переключить на `pb.authStore.isValid`. */
export default function RequireAuth() {
  if (!isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
