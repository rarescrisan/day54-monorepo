"use client";

import { type ButtonHTMLAttributes, type JSX } from "react";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

/**
 * The canonical reference component for this repo — when in doubt, copy its shape.
 *
 * - named export, one component per file, explicit return type
 * - props interface extends the native element so callers keep every DOM escape hatch
 * - `type="button"` by default: an unqualified <button> inside a form submits it
 * - variant travels as a data attribute, not a hand-rolled class-name map
 */
export function Button({
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps): JSX.Element {
  return <button data-variant={variant} type={type} {...props} />;
}
