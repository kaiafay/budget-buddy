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
}

/**
 * Handles the async data-loading side of the add/edit page.
 * Fetches a transaction (editTxId) or recurring rule (editRuleId) and
 * populates form state via the provided stable setters.
 * Returns { loading, error, retry } — callers never touch loading/error state directly.
 */
export function useEditLoader(
  editTxId: string | null,
  editRuleId: string | null,
  dateParam: string | null,
  setters: EditLoaderSetters,
) {
  const [loading, setLoading] = useState(!!(editTxId || editRuleId));
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
    if (editTxId) {
      setScopeNextSegmentDate(null);
      setScopeNextSegmentLoading(false);
      setScopeOccurrenceDate(null);
      setError(null);
      fetchTransaction(editTxId)
        .then((tx) => {
          if (!tx) {
            setError("Couldn't find this transaction.");
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
      fetchRecurringRule(editRuleId)
        .then((rule) => {
          if (!rule) {
            setError("Couldn't find this recurring rule.");
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
        })
        .catch(() => setError(USER_FACING_ERROR))
        .finally(() => setLoading(false));
    }
    // All setters are stable useState dispatchers — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTxId, editRuleId, dateParam, retryKey]);

  function retry() {
    setError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }

  return { loading, error, retry };
}
