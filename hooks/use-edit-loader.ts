"use client";

import { useState, useEffect } from "react";
import { parseISO } from "date-fns";
import {
  fetchTransaction,
  fetchRecurringRule,
  fetchNextChainSegment,
} from "@/lib/api";
import { USER_FACING_ERROR } from "@/lib/errors";

interface EditLoaderSetters {
  setLabel: (v: string) => void;
  setAmount: (v: string) => void;
  setType: (v: "expense" | "income") => void;
  setCategoryId: (v: string | null) => void;
  setDate: (v: Date | undefined) => void;
  setRecurring: (v: boolean) => void;
  setFrequency: (v: "weekly" | "biweekly" | "monthly" | "yearly") => void;
  setScopeOccurrenceDate: (v: string | null) => void;
  setScopeNextSegmentDate: (v: string | null) => void;
  setScopeNextSegmentLoading: (v: boolean) => void;
  setEndCondition?: (v: "none" | "date" | "count") => void;
  setEndDate?: (v: Date | undefined) => void;
}

/**
 * Handles the async data-loading side of the add/edit page.
 * Fetches a transaction (editTxId) or recurring rule (editRuleId) and
 * populates form state via the provided stable setters.
 * Returns { loading, error, retry } — callers never touch loading/error state directly.
 *
 * When hasInitialData=true, form fields are already populated from URL params so we
 * skip the full fetch (preventing a race that would overwrite user edits). For recurring
 * rules we still run fetchNextChainSegment since it's needed for date picker constraints.
 */
const WRONG_BUDGET_TX =
  "This transaction belongs to a different budget.";
const WRONG_BUDGET_RULE =
  "This recurring rule belongs to a different budget.";

export function useEditLoader(
  editTxId: string | null,
  editRuleId: string | null,
  dateParam: string | null,
  setters: EditLoaderSetters,
  hasInitialData = false,
  expectedAccountId?: string | null,
) {
  const [loading, setLoading] = useState(
    !hasInitialData && !!(editTxId || editRuleId),
  );
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const {
    setLabel,
    setAmount,
    setType,
    setCategoryId,
    setDate,
    setRecurring,
    setFrequency,
    setScopeOccurrenceDate,
    setScopeNextSegmentDate,
    setScopeNextSegmentLoading,
    setEndCondition,
    setEndDate,
  } = setters;

  useEffect(() => {
    if (!editTxId && !editRuleId) {
      setScopeNextSegmentDate(null);
      setScopeNextSegmentLoading(false);
      setScopeOccurrenceDate(null);
      setError(null);
      setLoading(false);
      return;
    }

    if (hasInitialData) {
      // Form fields are already populated from URL init params — skip the full fetch
      // to avoid overwriting any edits the user makes before the request completes.
      // For recurring rules we still need nextChainSegment for date picker constraints.
      if (editRuleId) {
        const occDate = dateParam ? dateParam.slice(0, 10) : new Date().toISOString().slice(0, 10);
        setScopeOccurrenceDate(occDate);
        setScopeNextSegmentLoading(true);
        void fetchNextChainSegment(editRuleId, occDate)
          .then(setScopeNextSegmentDate)
          .catch(() => setScopeNextSegmentDate(null))
          .finally(() => setScopeNextSegmentLoading(false));
      } else {
        setScopeOccurrenceDate(null);
        setScopeNextSegmentDate(null);
        setScopeNextSegmentLoading(false);
      }
      return;
    }

    if (editTxId) {
      setScopeNextSegmentDate(null);
      setScopeNextSegmentLoading(false);
      setScopeOccurrenceDate(null);
      setError(null);
      fetchTransaction(editTxId, expectedAccountId)
        .then((tx) => {
          if (!tx) {
            setError("Couldn't find this transaction.");
            return;
          }
          if (expectedAccountId && tx.account_id !== expectedAccountId) {
            setError(WRONG_BUDGET_TX);
            return;
          }
          setLabel(tx.label);
          setAmount(Math.abs(Number(tx.amount)).toFixed(2));
          setType(Number(tx.amount) >= 0 ? "income" : "expense");
          setCategoryId(tx.category_id ?? null);
          setDate(parseISO(tx.date));
        })
        .catch(() => setError(USER_FACING_ERROR))
        .finally(() => setLoading(false));
      return;
    }
    if (editRuleId) {
      setScopeNextSegmentDate(null);
      setScopeNextSegmentLoading(false);
      setScopeOccurrenceDate(null);
      setError(null);
      fetchRecurringRule(editRuleId, expectedAccountId)
        .then((rule) => {
          if (!rule) {
            setError("Couldn't find this recurring rule.");
            return;
          }
          if (
            expectedAccountId &&
            rule.account_id !== expectedAccountId
          ) {
            setError(WRONG_BUDGET_RULE);
            return;
          }
          setLabel(rule.label);
          setAmount(Math.abs(rule.amount).toFixed(2));
          setType(rule.amount >= 0 ? "income" : "expense");
          setCategoryId(rule.category_id ?? null);
          const occDate =
            dateParam && dateParam.length >= 10
              ? dateParam.slice(0, 10)
              : String(rule.start_date).slice(0, 10);
          setScopeOccurrenceDate(occDate);
          setScopeNextSegmentLoading(true);
          void fetchNextChainSegment(editRuleId, occDate)
            .then(setScopeNextSegmentDate)
            .catch(() => setScopeNextSegmentDate(null))
            .finally(() => setScopeNextSegmentLoading(false));
          setDate(dateParam ? parseISO(dateParam) : parseISO(rule.start_date));
          setRecurring(true);
          setFrequency(rule.frequency);
          if (rule.end_date) {
            setEndCondition?.("date");
            setEndDate?.(parseISO(rule.end_date));
          }
        })
        .catch(() => setError(USER_FACING_ERROR))
        .finally(() => setLoading(false));
    }
    // All setters are stable useState dispatchers — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTxId, editRuleId, dateParam, hasInitialData, expectedAccountId, retryKey]);

  function retry() {
    setError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }

  return { loading, error, retry };
}
