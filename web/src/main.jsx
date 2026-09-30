import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AppShell } from "./app-shell";
import { api } from "./api";
import { ThemeProvider } from "./theme";
import { DashboardPage } from "./pages/dashboard";
import { NovelPage } from "./pages/novel";
import { ReaderPage } from "./pages/reader";
import { AtlasPage } from "./pages/atlas";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    Component: AppShell,
    children: [
      { index: true, loader: () => api.overview(), Component: DashboardPage },
      {
        path: "novel/:novelId",
        loader: ({ params, request }) => {
          const lang = new URL(request.url).searchParams.get("lang") || "id";
          return api.novel(params.novelId, lang);
        },
        Component: NovelPage,
      },
      {
        path: "novel/:novelId/chapter/:chapterNumber",
        loader: ({ params, request }) => {
          const lang = new URL(request.url).searchParams.get("lang") || "id";
          return api.chapter(params.novelId, Number(params.chapterNumber), lang);
        },
        Component: ReaderPage,
      },
      {
        path: "novel/:novelId/atlas",
        loader: ({ params, request }) => {
          const lang = new URL(request.url).searchParams.get("lang") || "id";
          return api.atlas(params.novelId, lang);
        },
        Component: AtlasPage,
      },
    ],
  },
]);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider><RouterProvider router={router} /></ThemeProvider>
  </React.StrictMode>,
);
