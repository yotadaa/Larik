async function request(path) {
  const response = await fetch(path, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return response.json();
}

export const api = {
  overview: () => request("/api/overview"),
  novel: (novelId, lang = "id") => request(`/api/novel/${encodeURIComponent(novelId)}?lang=${encodeURIComponent(lang)}`),
  chapter: (novelId, chapterNumber, lang = "id") => request(`/api/novel/${encodeURIComponent(novelId)}/chapter/${chapterNumber}?lang=${encodeURIComponent(lang)}`),
  atlas: (novelId, lang = "id") => request(`/api/novel/${encodeURIComponent(novelId)}/atlas?lang=${encodeURIComponent(lang)}`),
};
