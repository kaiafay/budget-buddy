import { cn } from "@/lib/utils";
import { formatCurrencyAmount } from "@/lib/format-currency";

export type AmountTextProps = {
  amount: number;
  className?: string;
  signDisplay?: "always" | "negativeOnly";
  variant?: "list" | "hero" | "compact";
  polarity?: "auto" | "positive" | "negative";
  showCurrency?: boolean;
};

export function AmountText({
  amount,
  className,
  signDisplay = "always",
  variant = "list",
  polarity = "auto",
  showCurrency,
}: AmountTextProps) {
  const showDollar = showCurrency ?? variant !== "compact";

  const isPositive =
    polarity === "positive"
      ? true
      : polarity === "negative"
        ? false
        : amount >= 0;

  const fractionOpts =
    variant === "compact"
      ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2 };

  const formatted = formatCurrencyAmount(amount, fractionOpts);

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "text-[10px] leading-none font-medium tabular-nums",
          className,
        )}
      >
        {amount < 0 ? "-" : ""}
        {formatted}
      </span>
    );
  }

  const baseClass =
    variant === "hero"
      ? "text-2xl font-bold tabular-nums"
      : "text-sm font-semibold tabular-nums";

  const colorClass =
    polarity === "positive"
      ? "amount-text text-[var(--amount-positive)]"
      : polarity === "negative"
        ? "text-[var(--amount-negative)]"
        : isPositive
          ? "amount-text text-[var(--amount-positive)]"
          : "text-[var(--amount-negative)]";

  const signStr =
    signDisplay === "always" ? (isPositive ? "+" : "-") : isPositive ? "" : "-";

  return (
    <span className={cn(baseClass, colorClass, className)}>
      {signStr}
      {showDollar ? "$" : ""}
      {formatted}
    </span>
  );
}
