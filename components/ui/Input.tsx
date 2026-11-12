"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/cn";

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Classes for the outer wrapper. When given, it replaces the default full width, so a page can size the field. */
  wrapperClassName?: string;
}

interface InputOnly {
  /**
   * The filter bar size: the same height as a small button and the filter
   * chips beside it (40px with a mouse, 44px on touch screens), instead of 48px.
   */
  compact?: boolean;
}

/** One height for every control in a filter or tool row (fields, chips, small buttons). */
export const controlHeight = "h-10 pointer-coarse:h-11 max-md:h-11";

/**
 * A field in a filter or tool row, for pages that draw their own <input> or
 * <select>: pill shaped like the chips and buttons beside it, the same height,
 * the same hover and the same gold focus ring as every other field.
 */
export const filterField =
  `${controlHeight} rounded-full border border-border-strong bg-surface px-4 text-sm text-ink placeholder:text-ink-3 ` +
  "transition-colors hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const fieldShell =
  "w-full border bg-surface text-ink placeholder:text-ink-3 transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export const Input = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & FieldProps & InputOnly
>(function Input({ label, hint, error, required, className, wrapperClassName, compact, id, ...rest }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={wrapperClassName ?? "w-full"}>
      {label && <Label htmlFor={fieldId} required={required}>{label}</Label>}
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        // Announced as required without turning on the browser's own validation popups.
        aria-required={required || undefined}
        aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          fieldShell,
          compact ? cn(controlHeight, "rounded-full px-4 text-base sm:text-sm") : "h-12 rounded-md px-3.5",
          error ? "border-error" : "border-border-strong hover:border-ink-3",
          className,
        )}
        {...rest}
      />
      {error ? (
        <p id={`${fieldId}-err`} className="mt-1.5 text-sm font-medium text-error">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps
>(function Textarea({ label, hint, error, required, className, wrapperClassName, id, ...rest }, ref) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={wrapperClassName ?? "w-full"}>
      {label && <Label htmlFor={fieldId} required={required}>{label}</Label>}
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={!!error}
        // Announced as required without turning on the browser's own validation popups.
        aria-required={required || undefined}
        aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
        className={cn(
          fieldShell,
          "min-h-28 resize-y rounded-md px-3.5 py-3 leading-relaxed",
          error ? "border-error" : "border-border-strong hover:border-ink-3",
          className,
        )}
        {...rest}
      />
      {/* `hint` was accepted but never rendered — mirrors Input's behaviour now. */}
      {error ? (
        <p id={`${fieldId}-err`} className="mt-1.5 text-sm font-medium text-error">{error}</p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="mt-1.5 text-sm text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
});

export function Label({
  children,
  required,
  ...rest
}: React.LabelHTMLAttributes<HTMLLabelElement> & { required?: boolean }) {
  return (
    <label className="mb-1.5 block text-sm font-semibold text-ink-2" {...rest}>
      {children}
      {required && <span className="ml-0.5 text-error">*</span>}
    </label>
  );
}
