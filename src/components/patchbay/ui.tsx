import type { ButtonHTMLAttributes, ReactNode } from "react";

const quiet = "border border-line bg-surface text-ink";
const solid = "bg-ink text-canvas";
const danger = "border border-line bg-surface text-fault";

export function Button({
  variant = "quiet",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "quiet" | "solid" | "danger" }) {
  const look = variant === "solid" ? solid : variant === "danger" ? danger : quiet;
  return (
    <button
      type="button"
      className={`bay-btn inline-flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium disabled:opacity-40 ${look} ${className}`}
      {...props}
    />
  );
}

export function IconButton({
  label,
  pressed = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; pressed?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`bay-btn grid h-11 w-11 shrink-0 place-items-center rounded-lg border ${
        pressed ? "border-sage bg-ink text-canvas" : "border-line bg-surface text-ink"
      } ${className}`}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

export const controlClass =
  "h-11 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none placeholder:text-faint";

export const areaClass =
  "bay-paste w-full rounded-lg border border-line bg-canvas px-3 py-3 font-mono text-sm text-ink outline-none placeholder:text-faint";
