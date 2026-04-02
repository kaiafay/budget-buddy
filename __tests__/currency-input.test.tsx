// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { CurrencyInput } from "@/components/currency-input";

function setup(value = "") {
  const onChange = vi.fn();
  render(
    <CurrencyInput placeholder="0.00" value={value} onChange={onChange} />,
  );
  return { input: screen.getByPlaceholderText("0.00"), onChange };
}

describe("CurrencyInput onChange", () => {
  it("calls onChange for empty string", () => {
    // Start with a non-empty value so clearing it is a real change React tracks.
    const { input, onChange } = setup("1");
    fireEvent.input(input, { target: { value: "" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("calls onChange for an integer", () => {
    const { input, onChange } = setup();
    fireEvent.input(input, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("calls onChange for one decimal place", () => {
    const { input, onChange } = setup();
    fireEvent.input(input, { target: { value: "12.3" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("calls onChange for two decimal places", () => {
    const { input, onChange } = setup();
    fireEvent.input(input, { target: { value: "12.34" } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("does not call onChange for three decimal places", () => {
    const { input, onChange } = setup();
    fireEvent.input(input, { target: { value: "12.345" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange for scientific notation", () => {
    const { input, onChange } = setup();
    fireEvent.input(input, { target: { value: "1e3" } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not call onChange for alphabetic input", () => {
    const { input, onChange } = setup();
    fireEvent.input(input, { target: { value: "abc" } });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("CurrencyInput onPaste", () => {
  // Use a stateful wrapper so React re-renders with the updated value,
  // keeping input.value stable for assertion (e.target is a live DOM ref).
  function StatefulInput({ initial = "" }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
      <CurrencyInput
        placeholder="0.00"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    );
  }

  it("updates the input value when pasting a currency string", () => {
    render(<StatefulInput />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("0.00");
    fireEvent.paste(input, {
      clipboardData: { getData: () => "$1,234.50" },
    });
    expect(input.value).toBe("1234.50");
  });

  it("does not update the input value when pasting non-numeric text", () => {
    render(<StatefulInput />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("0.00");
    fireEvent.paste(input, {
      clipboardData: { getData: () => "abc" },
    });
    expect(input.value).toBe("");
  });

  it("does not update the input value when pasted text combined with existing value exceeds 2 decimal places", () => {
    // Existing value "12.3", cursor at end, paste "45" → combined "12.345" → rejected
    render(<StatefulInput initial="12.3" />);
    const input = screen.getByPlaceholderText<HTMLInputElement>("0.00");
    input.setSelectionRange(4, 4);
    fireEvent.paste(input, {
      clipboardData: { getData: () => "45" },
    });
    expect(input.value).toBe("12.3");
  });
});
