"use client";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dateRangeError } from "@/lib/sales/period";
import { Input } from "./ui/primitives/input";

export function DateRangeFilter({
  from,
  to,
  action = "/app/sales",
  label = "Filter sales by date",
}: {
  from: string;
  to: string;
  action?: "/app/sales" | "/expenses";
  label?: string;
}) {
  const router = useRouter();
  const errorId = useId();
  const [range, setRange] = useState({ start: from, end: to });
  const lastApplied = useRef({ from, to });
  const lastRequested = useRef<{ start: string; end: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const { start, end } = range;
  const error = dateRangeError(start, end);

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
        ? { start: from, end: to }
        : current,
    );
  }, [from, to]);

  useEffect(() => {
    if (error || (start === from && end === to)) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      params.delete("period");
      params.set("from", start);
      params.set("to", end);
      lastRequested.current = { start, end };
      startTransition(() => {
        router.replace(`${action}?${params}`, { scroll: false });
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [start, end, from, to, error, action, router]);

  return (
    <form
      className="report-filter"
      method="get"
      action={action}
      aria-label={label}
      aria-busy={isPending || undefined}
      onSubmit={(event) => event.preventDefault()}
    >
      {error && (
        <p className="date-range-feedback" id={errorId} role="alert">
          {error}
        </p>
      )}
      <label className="field">
        From Date
        <Input
          type="date"
          name="from"
          value={start}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setRange((current) => ({ ...current, start: value }));
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          required
        />
      </label>
      <label className="field">
        To Date
        <Input
          type="date"
          name="to"
          value={end}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setRange((current) => ({ ...current, end: value }));
          }}
          min={start || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          required
        />
      </label>
      <span className="sr-only" role="status">
        {isPending ? "Updating report…" : ""}
      </span>
    </form>
  );
}
