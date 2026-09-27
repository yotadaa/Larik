export function validateRouteSegment(value: string | undefined, label: string): string {
  if (!value || value.length > 260 || /[\u0000-\u001F\u007F]/.test(value) || value.includes("/") || value.includes("\\")) {
    throw new Response(`Invalid ${label}.`, { status: 400 });
  }
  return value;
}

export function readSearchParam(value: string | null, maxLength = 120): string {
  return (value ?? "").trim().slice(0, maxLength);
}

export function readPositiveInt(value: string | null, fallback = 1, max = 100000): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

export function hrefChapter(novelId: string, chapterId: string) {
  return `/novels/${encodeURIComponent(novelId)}/chapters/${encodeURIComponent(chapterId)}`;
}

export function hrefNovel(novelId: string) {
  return `/novels/${encodeURIComponent(novelId)}`;
}

export function hrefReference(novelId: string, reference: string) {
  return `/novels/${encodeURIComponent(novelId)}/reference/${encodeURIComponent(reference)}`;
}
