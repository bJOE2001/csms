"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dateRangeError } from "@/lib/sales/period";
import { useLoadingSignal } from "./ui/global-loading-bar";
import { DatePicker } from "./ui/date-picker";

type LoadFailure = { from: string; to: string; message: string };

export function DateRangeFilter({
  from,
  to,
  action = "/app/sales",
  label = "Filter sales by date",
  loadFailure,
}: {
  from: string;
  to: string;
  action?: "/app/sales" | "/expenses" | "/dashboard" | "/app/inventory";
  label?: string;
  loadFailure?: LoadFailure;
}) {
  const router = useRouter();
  const errorId = useId();
  const [range, setRange] = useState({ start: from, end: to, source: "calendar" as "calendar" | "input" });
  const [navigationError, setNavigationError] = useState<string | null>(null);
  const lastApplied = useRef({ from, to });
  const lastRequested = useRef<{ start: string; end: string } | null>(null);
  const retryFailed = useRef(false);
  const [isPending, startTransition] = useTransition();
  useLoadingSignal(isPending);
  const { start, end } = range;
  const error = dateRangeError(start, end);
  // A route change can replace applied dates before the local fields synchronize.
  const syncingApplied = !lastRequested.current && start === lastApplied.current.from && end === lastApplied.current.to && (from !== lastApplied.current.from || to !== lastApplied.current.to);

  useEffect(() => {
    const previous = lastApplied.current;
    if (previous.from === from && previous.to === to) return;
    lastApplied.current = { from, to };
    const requested = lastRequested.current;
    if (requested?.start === from && requested.end === to)
      lastRequested.current = null;
    // Keep newer input edits when an earlier navigation finishes loading.
    setRange((current) =>
      !requested && current.start === previous.from && current.end === previous.to
        ? { start: from, end: to, source: "calendar" }
        : current,
    );
  }, [from, to]);

  useEffect(() => {
    if (error || syncingApplied) return;
    const requested = lastRequested.current;
    if (requested?.start === start && requested.end === end) return;
    if (start === from && end === to && !requested && !retryFailed.current) return;
    const request = () => {
      if (!navigator.onLine) {
        lastRequested.current = null;
        setNavigationError("You’re offline. Reconnect and choose a date again to update the report.");
        return;
      }
      const params = new URLSearchParams(window.location.search);
      params.delete("period");
      params.set("from", start);
      params.set("to", end);
      lastRequested.current = { start, end };
      retryFailed.current = false;
      startTransition(() => {
        try {
          // App Router supersedes older navigations, keeping one report request path.
          return router.replace(`${action}?${params}`, { scroll: false });
        } catch {
          lastRequested.current = null;
          setNavigationError("The report could not be updated. Your previous results are still shown.");
        }
      });
    };
    if (range.source === "calendar") {
      request();
      return;
    }
    const timer = window.setTimeout(request, 350);
    return () => window.clearTimeout(timer);
  }, [range, start, end, from, to, error, action, router, syncingApplied]);

  const changeDate = (field: "start" | "end", next: string, source: "calendar" | "input") => {
    setNavigationError(null);
    const requested = lastRequested.current;
    if (navigationError || (loadFailure && (!requested || (requested.start === loadFailure.from && requested.end === loadFailure.to)))) {
      lastRequested.current = null;
      retryFailed.current = true;
    }
    setRange(current => ({ ...current, [field]: next, source }));
  };
  const applyRange = (nextStart: string, nextEnd: string) => {
    setNavigationError(null);
    lastRequested.current = null;
    retryFailed.current = true;
    setRange({ start: nextStart, end: nextEnd, source: "calendar" });
  };
  const failed = loadFailure?.from === start && loadFailure.to === end ? loadFailure.message : null;
  const feedback = error ?? navigationError ?? failed;

  return (
    <form
      className="report-filter"
      method="get"
      action={action}
      aria-label={label}
      aria-busy={isPending || undefined}
      onSubmit={event => event.preventDefault()}
    >
      {feedback && (
        <p className="date-range-feedback" id={errorId} role="alert">
          {feedback}
        </p>
      )}
      <div className="field">
        <label htmlFor={`${errorId}-from`}>From Date</label>
        <DatePicker
          id={`${errorId}-from`}
          label="From Date"
          name="from"
          value={start}
          onValueChange={(value, source) => changeDate("start", value, source)}
          onRangeSelect={applyRange}
          range={{ from: start, to: end }}
          aria-invalid={error ? true : undefined}
          aria-describedby={feedback ? errorId : undefined}
          required
        />
      </div>
      <div className="field">
        <label htmlFor={`${errorId}-to`}>
          To Date

        </label>
        <DatePicker
          id={`${errorId}-to`}
          label="To Date"
          name="to"
          value={end}
          onValueChange={(value, source) => changeDate("end", value, source)}
          onRangeSelect={applyRange}
          range={{ from: start, to: end }}
          min={start || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={feedback ? errorId : undefined}
          required
        />
      </div>
    </form>
  );
}
