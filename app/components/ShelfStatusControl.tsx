import { useFetcher } from "react-router";
import { BookmarkSquareIcon } from "@heroicons/react/24/outline";
import { CustomSelect } from "./CustomSelect";
import type { ReaderUser } from "~/lib/auth.server";
import type { ShelfStatus } from "~/lib/reader-state.server";

const options = [
  { value: "", label: "Set shelf status" },
  { value: "planned", label: "Want to read" },
  { value: "reading", label: "Reading" },
  { value: "paused", label: "Paused" },
  { value: "finished", label: "Finished" },
];

export function ShelfStatusControl({ novelId, user, status }: { novelId: string; user: ReaderUser | null; status?: ShelfStatus | null }) {
  const fetcher = useFetcher();
  if (!user) return null;
  const current = (fetcher.formData?.get("status") as string | null) ?? status ?? "";
  return <div className="shelf-status-control">
    <BookmarkSquareIcon aria-hidden="true" />
    <CustomSelect
      ariaLabel="Reading shelf status"
      value={current}
      options={options}
      disabled={fetcher.state !== "idle"}
      onChange={(next) => {
        if (!next) return;
        fetcher.submit({ intent: "status", novelId, status: next }, { method: "post", action: "/reader-state" });
      }}
    />
  </div>;
}
