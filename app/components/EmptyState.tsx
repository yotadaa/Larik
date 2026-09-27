import { BookOpenIcon } from "@heroicons/react/24/outline";

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-state__icon" aria-hidden="true"><BookOpenIcon /></span>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
