import { cn } from "@/lib/utils";

/**
 * Text-only brand wordmark. No icon, no SVG — just typography that stands on its own.
 * Uses a subtle navy → royal blue gradient with a faint gold accent on "Tracker".
 */
export function Wordmark({
  className,
  size = "sm",
  showSubtitle = true,
  subtitle = "Document & QR Generator",
  tone = "auto",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  showSubtitle?: boolean;
  subtitle?: string;
  /** "auto" uses theme tokens; "light" is for dark hero backgrounds. */
  tone?: "auto" | "light";
}) {
  const titleSize =
    size === "lg" ? "text-2xl md:text-3xl" : size === "md" ? "text-lg" : "text-sm";
  const subSize =
    size === "lg" ? "text-[11px]" : size === "md" ? "text-[10px]" : "text-[10px]";

  const isLight = tone === "light";

  return (
    <div className={cn("inline-flex flex-col leading-none", className)}>
      <span
        className={cn(
          "font-bold tracking-[-0.02em]",
          titleSize,
          isLight
            ? "text-white"
            : "bg-clip-text text-transparent bg-[image:linear-gradient(120deg,oklch(0.22_0.05_260)_0%,oklch(0.40_0.14_258)_55%,oklch(0.22_0.05_260)_100%)] dark:bg-[image:linear-gradient(120deg,oklch(0.96_0.01_260)_0%,oklch(0.82_0.10_258)_55%,oklch(0.96_0.01_260)_100%)]",
        )}
      >
        CIT Doc
        <span
          className={cn(
            isLight
              ? "text-[var(--color-gold)]"
              : "bg-clip-text text-transparent bg-[image:linear-gradient(120deg,oklch(0.74_0.13_85),oklch(0.82_0.14_82))]",
          )}
        >
          Tracker
        </span>
      </span>
      {showSubtitle && (
        <span
          className={cn(
            "mt-1.5 font-medium uppercase tracking-[0.22em]",
            subSize,
            isLight ? "text-white/60" : "text-muted-foreground",
          )}
        >
          {subtitle}
        </span>
      )}
    </div>
  );
}
