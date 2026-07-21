import { createBrowserRouter } from "react-router";
import RequireAuth from "./RequireAuth";
import AuthPage from "../pages/AuthPage";
import AppShell from "../pages/AppShell";
import HomePage from "../pages/HomePage";
import HistoryPage from "../pages/HistoryPage";
import ProfilePage from "../pages/ProfilePage";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: AuthPage,
  },
  {
    Component: RequireAuth,
    children: [
      {
        Component: AppShell,
        children: [
          { path: "home",    Component: HomePage    },
          { path: "history", Component: HistoryPage },
          { path: "profile", Component: ProfilePage },
        ],
      },
    ],
  },
]);
