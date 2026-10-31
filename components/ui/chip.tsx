import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { pressed?: boolean };

export function Chip({ pressed, className = "", type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      aria-pressed={pressed}
      className={`ease-ui cursor-pointer rounded-full border px-2.5 py-0.5 text-[12.5px] ${
        pressed ? "border-accent bg-accent-soft text-accent" : "border-line bg-sunk text-ink"
      } ${className}`}
      {...props}
    />
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}
