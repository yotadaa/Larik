import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon } from "@heroicons/react/24/outline";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function CustomSelect({
  id,
  name,
  value,
  defaultValue,
  options,
  onChange,
  ariaLabel,
  className = "",
  disabled = false,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  ariaLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const generated = useId().replace(/:/g, "");
  const buttonId = id ?? `custom-select-${generated}`;
  const listId = `${buttonId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const controlled = value !== undefined;
  const initial = value ?? defaultValue ?? options.find((option) => !option.disabled)?.value ?? "";
  const [internalValue, setInternalValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const currentValue = controlled ? value ?? "" : internalValue;
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === currentValue));
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const selected = useMemo(
    () => options.find((option) => option.value === currentValue) ?? options[0],
    [options, currentValue],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setActiveIndex(selectedIndex);
    requestAnimationFrame(() => optionRefs.current[selectedIndex]?.focus());
  }, [open, selectedIndex]);

  const choose = (next: string) => {
    if (!controlled) setInternalValue(next);
    onChange?.(next);
    setOpen(false);
  };

  const move = (direction: 1 | -1) => {
    if (!options.length) return;
    let next = activeIndex;
    for (let i = 0; i < options.length; i++) {
      next = (next + direction + options.length) % options.length;
      if (!options[next]?.disabled) break;
    }
    setActiveIndex(next);
    optionRefs.current[next]?.focus();
  };

  return (
    <div ref={rootRef} className={`custom-select ${open ? "is-open" : ""} ${className}`.trim()}>
      {name ? <input type="hidden" name={name} value={currentValue} /> : null}
      <button
        id={buttonId}
        className="custom-select__trigger"
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={() => setOpen((state) => !state)}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            if (!open) {
              setOpen(true);
              return;
            }
            if (event.key === "ArrowDown") move(1);
            else if (event.key === "ArrowUp") move(-1);
            else {
              const index = event.key === "Home"
                ? options.findIndex((option) => !option.disabled)
                : options.findLastIndex((option) => !option.disabled);
              if (index >= 0) {
                setActiveIndex(index);
                optionRefs.current[index]?.focus();
              }
            }
          }
        }}
      >
        <span>{selected?.label ?? "Select"}</span>
        <ChevronDownIcon aria-hidden="true" />
      </button>
      {open ? (
        <div id={listId} className="custom-select__list" role="listbox" aria-labelledby={buttonId}>
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === currentValue}
              className={`custom-select__option${option.value === currentValue ? " is-selected" : ""}`}
              disabled={option.disabled}
              tabIndex={index === activeIndex ? 0 : -1}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
                else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
                else if (event.key === "Home" || event.key === "End") {
                  event.preventDefault();
                  const next = event.key === "Home"
                    ? options.findIndex((item) => !item.disabled)
                    : options.findLastIndex((item) => !item.disabled);
                  if (next >= 0) { setActiveIndex(next); optionRefs.current[next]?.focus(); }
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  setOpen(false);
                  document.getElementById(buttonId)?.focus();
                }
              }}
            >
              <span>{option.label}</span>
              {option.value === currentValue ? <CheckIcon aria-hidden="true" /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
