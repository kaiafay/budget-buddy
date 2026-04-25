"use client";

import { useState } from "react";
import {
  moveRecurringOccurrence,
  applyRecurringEditFromDate,
} from "@/lib/transactions-mutations";
import type { PendingRecurringEdit } from "@/lib/types";

/**
 * Owns all recurring-edit scope dialog state and mutation logic.
 * Used identically by add/page.tsx and day-sheet.tsx.
 *
 * confirmScope runs the mutation and returns { targetDate } on success
 * or null on failure — the caller decides what to do after (navigate vs mutate+close).
 */
export function useRecurringEditScope(accountId: string | null) {
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [nextSegmentDate, setNextSegmentDate] = useState<string | null>(null);
  const [nextSegmentLoading, setNextSegmentLoading] = useState(false);
  const [occurrenceDate, setOccurrenceDate] = useState<string | null>(null);
  const [pendingEdit, setPendingEdit] = useState<PendingRecurringEdit | null>(
    null,
  );

  function openScope(payload: PendingRecurringEdit) {
    setPendingEdit(payload);
    setScopeDialogOpen(true);
  }

  async function confirmScope(
    scope: "once" | "fromDate",
  ): Promise<{ targetDate: string } | null> {
    if (!pendingEdit) return null;
    const p = pendingEdit;

    if (scope === "once") {
      const { error } = await moveRecurringOccurrence({
        ruleId: p.ruleId,
        originalOccurrenceDate: p.occurrenceDate,
        targetDate: p.newStartDate ?? p.occurrenceDate,
        accountId: accountId ?? "",
        label: p.label,
        amount: p.amount,
        category_id: p.category_id,
      });
      if (error) return null;
    } else {
      const { error } = await applyRecurringEditFromDate(
        p.ruleId,
        p.occurrenceDate,
        {
          label: p.label,
          amount: p.amount,
          frequency: p.frequency,
          category_id: p.category_id,
          newStartDate: p.newStartDate,
          endDate: p.endDate,
          recurrenceCount: p.recurrenceCount,
        },
      );
      if (error) return null;
    }

    setScopeDialogOpen(false);
    setPendingEdit(null);
    return { targetDate: p.newStartDate };
  }

  function cancelScope() {
    setScopeDialogOpen(false);
    setPendingEdit(null);
  }

  function reset() {
    setScopeDialogOpen(false);
    setPendingEdit(null);
    setNextSegmentDate(null);
    setNextSegmentLoading(false);
    setOccurrenceDate(null);
  }

  return {
    scopeDialogOpen,
    nextSegmentDate,
    nextSegmentLoading,
    occurrenceDate,
    pendingEdit,
    openScope,
    confirmScope,
    cancelScope,
    setNextSegmentDate,
    setNextSegmentLoading,
    setOccurrenceDate,
    reset,
  };
}
