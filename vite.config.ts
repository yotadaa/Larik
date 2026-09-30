import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (!process.env.DATABASE_PATH && env.DATABASE_PATH) process.env.DATABASE_PATH = env.DATABASE_PATH;
  if (!process.env.DEFAULT_LANG_ID && env.DEFAULT_LANG_ID) process.env.DEFAULT_LANG_ID = env.DEFAULT_LANG_ID;

  return {
    plugins: [reactRouter(), tsconfigPaths()],
    ssr: {
      external: ["node:sqlite"],
    },
  };
});
