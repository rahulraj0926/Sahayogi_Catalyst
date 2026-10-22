"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import type { ThemeMode } from "./theme";

const OPTIONS: { mode: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { mode: "light", label: "Light theme", Icon: Sun },
  { mode: "dark", label: "Dark theme", Icon: Moon },
  { mode: "system", label: "Match system", Icon: Monitor },
];

/** Three-way theme switch (ported from Setu's ThemeToggle). Lives in the user menu. */
export function ThemeToggle() {
  const { mode, setMode } = useTheme();

  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-0.5 rounded-full bg-[var(--search-bg)] p-0.5">
      {OPTIONS.map(({ mode: optionMode, label, Icon }) => {
        const isActive = mode === optionMode;
        return (
          <button
            key={optionMode}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => setMode(optionMode)}
            className={`
              tap-pop
              flex
              h-8
              w-8
              items-center
              justify-center
              rounded-full
              transition-colors
              focus-visible:outline-none
              focus-visible:ring-2
              focus-visible:ring-[var(--icon-btn-navy)]
              ${
                isActive
                  ? "bg-[var(--surface)] text-[var(--text-heading)] shadow-sm"
                  : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }
            `}
          >
            <Icon size={16} />
          </button>
        );
      })}
    </div>
  );
}
