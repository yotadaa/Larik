import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("logout", "routes/logout.tsx"),
  route("reader-state", "routes/reader-state.tsx"),
  route("bookmarks", "routes/bookmarks.tsx"),
  route("translate", "routes/translate.tsx"),
  route("novels/:novelId/atlas", "routes/atlas.tsx"),
  route("library", "routes/library.tsx"),
  route("novels", "routes/library.tsx", { id: "routes/novels" }),
  route("novels/:novelId", "routes/novel.tsx"),
  route("novels/:novelId/chapters/:chapterId", "routes/chapter.tsx"),
  route("novels/:novelId/reference/:reference", "routes/reference.tsx"),
] satisfies RouteConfig;
