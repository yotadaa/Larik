export const BRAND_NAME = "Larik by Mukhtada";
export const BRAND_SHORT_NAME = "Larik";
export const BRAND_BYLINE = "by Mukhtada";
export const BRAND_DESCRIPTION =
  "Larik by Mukhtada is a calm, database-backed novel reader powered by Cloudflare Workers and D1.";

export function brandedTitle(page?: string) {
  return page ? `${page} — ${BRAND_NAME}` : BRAND_NAME;
}
