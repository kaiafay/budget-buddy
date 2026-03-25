import { describe, it, expect } from "vitest";
import { getRecurringRuleIdAndDate } from "@/lib/recurring-rules";

describe("getRecurringRuleIdAndDate", () => {
  it("extracts ruleId and date from a standard synthetic ID", () => {
    const id = "11111111-1111-4111-8111-111111111111-2025-03-15";
    const { ruleId, date } = getRecurringRuleIdAndDate(id);
    expect(ruleId).toBe("11111111-1111-4111-8111-111111111111");
    expect(date).toBe("2025-03-15");
  });

  it("handles a different UUID and date correctly", () => {
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-2024-12-31";
    const { ruleId, date } = getRecurringRuleIdAndDate(id);
    expect(ruleId).toBe("aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(date).toBe("2024-12-31");
  });

  it("date part is always exactly 10 characters in yyyy-MM-dd format", () => {
    const id = "22222222-2222-4222-8222-222222222222-2026-01-01";
    const { date } = getRecurringRuleIdAndDate(id);
    expect(date).toHaveLength(10);
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("ruleId is exactly 36 characters and does not include the separator", () => {
    const id = "33333333-3333-4333-8333-333333333333-2025-06-15";
    const { ruleId } = getRecurringRuleIdAndDate(id);
    expect(ruleId).toHaveLength(36);
    expect(ruleId).not.toMatch(/-$/);
  });

  it("round-trips: re-joining ruleId and date reconstructs the original id", () => {
    const ruleUuid = "55555555-5555-4555-8555-555555555555";
    const dateStr = "2025-11-30";
    const id = `${ruleUuid}-${dateStr}`;
    const { ruleId, date } = getRecurringRuleIdAndDate(id);
    expect(`${ruleId}-${date}`).toBe(id);
  });
});
