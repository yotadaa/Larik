import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const SERVER_ENV_KEYS = [
  "DATABASE_PATH", "DEFAULT_LANG_ID", "LARIK_APP_MODE",
  "BASE_URL", "API_KEY", "MODEL", "MAX_TOKENS", "CONTEXT_WINDOW", "COMPACT_THRESHOLD", "SAFETY_MARGIN_TOKENS",
  "LLM_TIMEOUT_SECONDS", "LLM_MAX_RETRIES", "LLM_RETRY_BASE_SECONDS", "LLM_TOKEN_PARAMETER", "REASONING_EFFORT",
  "TRANSLATION_TEMPERATURE", "METADATA_TEMPERATURE", "REPAIR_TEMPERATURE",
  "PREVIOUS_CHAPTERS", "PREVIOUS_FULL_CHAPTERS", "CONTEXT_ENTITY_LIMIT", "CONTEXT_RELATIONSHIP_LIMIT",
  "CONTEXT_TERMINOLOGY_LIMIT", "CONTEXT_GLOSSARY_LIMIT", "CONTEXT_ARC_LIMIT", "QUALITY_REVIEW", "STRICT_SEQUENTIAL",
  "RAW_STORY_ROOT", "ADMIN_MAX_PARALLEL_JOBS", "TRANSLATOR_PYTHON", "TRANSLATOR_PROJECT_ROOT", "TRANSLATION_LOG_DIR",
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of SERVER_ENV_KEYS) {
    if (!process.env[key] && env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [reactRouter(), tsconfigPaths()],
    ssr: {
      external: ["node:sqlite"],
    },
  };
});
