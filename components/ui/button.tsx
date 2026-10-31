import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "default" | "primary" | "danger";
  size?: "md" | "sm";
};

const tones = {
  default: "border-line bg-surface text-ink hover:border-accent",
  primary: "border-accent bg-accent text-accent-ink",
  danger: "border-line bg-surface text-bad hover:border-bad",
};

const sizes = {
  md: "px-[11px] py-1.5",
  sm: "px-2 py-[3px] text-[12.5px]",
};

export function Button({ tone = "default", size = "md", className = "", type = "button", ...props }: Props) {
  return (
    <button
      type={type}
      className={`ease-ui inline-flex items-center gap-1.5 whitespace-nowrap rounded-app border font-medium disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}

export function TextButton({ className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={`cursor-pointer border-0 bg-transparent p-0 text-left text-accent underline decoration-1 underline-offset-2 ${className}`}
      {...props}
    />
  );
}
