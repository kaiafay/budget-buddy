import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/inline-error";

export const glassRetryButtonClassName =
  "h-9 rounded-xl border-white/30 bg-white/10 text-white hover:bg-white/20 active:bg-white/15";

type ErrorBannerVariant = "panel" | "strip" | "inline";

export type ErrorBannerProps = {
  message: string;
  onRetry: () => void | Promise<void>;
  retryLabel?: string;
  className?: string;
  variant?: ErrorBannerVariant;
};

export function ErrorBanner({
  message,
  onRetry,
  retryLabel = "Try again",
  className,
  variant = "panel",
}: ErrorBannerProps) {
  const rootClass =
    variant === "panel"
      ? "rounded-2xl border border-destructive/40 bg-destructive/15 px-4 py-3"
      : variant === "strip"
        ? "border-t border-white/20 px-5 pb-6 pt-4"
        : "flex flex-col gap-2";

  return (
    <div className={cn(rootClass, className)}>
      {variant === "inline" ? (
        <InlineError>{message}</InlineError>
      ) : (
        <p
          className={cn(
            "text-sm",
            variant === "panel" ? "text-white" : "text-white/90",
          )}
          role="alert"
        >
          {message}
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        className={cn(
          glassRetryButtonClassName,
          variant !== "inline" && "mt-2",
        )}
        onClick={() => void onRetry()}
      >
        {retryLabel}
      </Button>
    </div>
  );
}
