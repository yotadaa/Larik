import { ChevronDownIcon, EyeIcon } from "@heroicons/react/24/outline";

export function SpoilerGate({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="spoiler-gate">
      <summary>
        <span className="spoiler-gate__label"><EyeIcon aria-hidden="true" /><span>{label}</span></span>
        <ChevronDownIcon className="spoiler-gate__chevron" aria-hidden="true" />
      </summary>
      <div className="spoiler-gate__content">{children}</div>
    </details>
  );
}
