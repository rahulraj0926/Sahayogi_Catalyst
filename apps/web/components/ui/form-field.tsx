import type { ReactNode } from "react";
import { Label } from "./label";

export interface FormFieldA11yProps {
  id: string;
  "aria-invalid": boolean;
  "aria-required"?: boolean;
  "aria-describedby"?: string;
}

/**
 * Render-prop wrapper around a label + description + error message, wiring
 * up the aria attributes (`aria-invalid`/`aria-required`/`aria-describedby`)
 * that connect an input to its error/description text — one place that gets
 * this right instead of every form field hand-rolling it slightly
 * differently. `required` drives both the visible asterisk and
 * `aria-required`; callers derive it from a zod schema via
 * deriveRequiredFields rather than hand-typing it (see
 * modules/administration/schemas/derive-required-fields.ts).
 */
export function FormField({
  id,
  label,
  required,
  description,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  description?: string;
  error?: string;
  children: (a11y: FormFieldA11yProps) => ReactNode;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {required && (
          <>
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </Label>
      {children({
        id,
        "aria-invalid": !!error,
        ...(required ? { "aria-required": true } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })}
      {description && (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      )}
      {error && !/^(required|.*must contain at least 1 character.*)$/i.test(error) && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
