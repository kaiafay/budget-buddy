"use client";

import { Input } from "@/components/ui/input";

// Allows empty, digits only, or digits with up to 2 decimal places.
// type="text" + inputMode="decimal" avoids the browser's type="number" quirks
// (scientific notation, no selectionStart/End support) while still showing
// a numeric keyboard on mobile.
const CURRENCY_PATTERN = /^\d*\.?\d{0,2}$/;

export function CurrencyInput({
  onChange,
  onPaste,
  ...props
}: React.ComponentProps<typeof Input>) {
  return (
    <Input
      inputMode="decimal"
      {...props}
      onChange={(e) => {
        if (CURRENCY_PATTERN.test(e.target.value)) {
          onChange?.(e);
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text");
        const cleaned = pasted.replace(/[$,\s]/g, "");
        if (CURRENCY_PATTERN.test(cleaned)) {
          const input = e.currentTarget;
          input.setRangeText(
            cleaned,
            input.selectionStart ?? 0,
            input.selectionEnd ?? input.value.length,
            "end",
          );
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        onPaste?.(e);
      }}
    />
  );
}
