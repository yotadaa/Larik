import { AtlasExplorer, type AtlasViewName } from "./AtlasExplorer";
import type { AtlasData } from "~/lib/atlas";

/** Atlas rows come from local SQLite; the browser only filters and renders the selected window. */
export function AtlasView({ atlas, initialView }: { atlas: AtlasData; initialView?: AtlasViewName }) {
  if (!atlas.nodes.length && !atlas.events.length) {
    return <section className="empty-state"><h2>No stored Story Atlas entries in this window</h2><p>Try a wider range. Later chapters only appear after their metadata has been imported into the database.</p></section>;
  }
  return <AtlasExplorer atlas={atlas} initialView={initialView} />;
}
