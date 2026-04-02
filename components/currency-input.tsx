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
        const input = e.currentTarget;
        const start = input.selectionStart ?? 0;
        const end = input.selectionEnd ?? input.value.length;
        // Validate the combined result, not just the pasted fragment,
        // so a paste into a partially-filled field can't produce >2 decimal places.
        const combined = input.value.slice(0, start) + cleaned + input.value.slice(end);
        if (CURRENCY_PATTERN.test(combined)) {
          // Use the native value setter (same technique as @testing-library) so
          // React's fiber tracking recognizes the change and fires synthetic onChange.
          // Plain `input.value = combined` bypasses React's tracking and is unreliable.
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )?.set;
          nativeSetter?.call(input, combined);
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
        onPaste?.(e);
      }}
    />
  );
}
