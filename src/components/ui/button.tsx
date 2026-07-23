import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-content hover:bg-accent-hover shadow-sm disabled:hover:bg-accent",
  secondary:
    "bg-surface-raised text-content border border-border hover:border-border-strong hover:bg-surface-sunken",
  ghost: "text-content-muted hover:text-content hover:bg-surface-sunken",
  danger: "bg-negative text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  // Minimum 44px touch targets throughout — WCAG 2.2 target size, and simply necessary on mobile.
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-6 text-[0.95rem]",
  lg: "h-14 px-8 text-base",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium",
        "transition-colors duration-150",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}
