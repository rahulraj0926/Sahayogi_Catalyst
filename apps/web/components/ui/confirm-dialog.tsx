"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useSingleFlightTransition } from "@/lib/use-single-flight-transition";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./dialog";

/**
 * What `onConfirm` may resolve to: a Server Action's own `{ ok, error }`
 * result (a refusal is shown inside the dialog, which stays open), or nothing.
 */
export type ConfirmOutcome = { ok: boolean; error?: string } | void;

const FALLBACK_ERROR = "Something went wrong. Please try again.";

/**
 * The app's confirmation step for an action the user should not take by
 * accident (delete, cancel, approve, finalize) — in place of the browser's
 * native confirm()/alert(), which look nothing like the rest of the app,
 * block the page and lose a refusal's text the moment they are dismissed.
 *
 * Controlled (`open`/`onOpenChange`), so the caller decides which row it is
 * for. While `onConfirm` runs, both buttons are disabled and the dialog can't
 * be dismissed — a second click can't send the request twice. A refusal
 * (e.g. "Department is still in use") stays readable in the dialog; success
 * closes it.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  pendingLabel = "Working…",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  /** Extra content between the description and the buttons (e.g. a warning). */
  children?: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => Promise<ConfirmOutcome> | ConfirmOutcome;
  /**
   * Where the cursor goes when the dialog closes. Without it, focus goes back
   * to whatever opened the dialog — or nowhere, if that was a keyboard shortcut
   * or a button the confirmed action removed.
   */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [isPending, startTransition] = useSingleFlightTransition();
  const [error, setError] = useState<string | null>(null);

  // Each opening starts clean: a refusal belongs to the attempt that caused it.
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await onConfirm();
        if (outcome && !outcome.ok) {
          setError(outcome.error || FALLBACK_ERROR);
          return;
        }
        onOpenChange(false);
      } catch (err) {
        setError(err instanceof Error && err.message ? err.message : FALLBACK_ERROR);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isPending && onOpenChange(next)}>
      <DialogContent className="max-w-md" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            {destructive && (
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden="true" />
              </div>
            )}
            <DialogTitle>{title}</DialogTitle>
          </div>
          {description && <DialogDescription className="pt-2">{description}</DialogDescription>}
        </DialogHeader>

        {children}

        {error && (
          <div role="alert" className="rounded-md border border-red-200 dark:border-[var(--status-critical-fg)]/30 bg-red-50 dark:bg-[var(--status-critical-bg)] px-3 py-2 text-sm font-medium text-red-600 dark:text-[var(--status-critical-fg)]">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={destructive ? "destructive" : "default"} onClick={handleConfirm} disabled={isPending}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {pendingLabel}
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
