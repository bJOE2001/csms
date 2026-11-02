"use client";
import Link from "next/link";
import { useState } from "react";
import { salesPeriods } from "@/lib/sales/period";
import { Button } from "./ui/button";
import { Input } from "./ui/primitives/input";

export function SalesDateFilter({
  from,
  to,
  today,
  period,
}: {
  from: string;
  to: string;
  today: string;
  period?: string;
}) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  return (
    <>
      <nav
        className="mb-5 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        aria-label="Sales date shortcuts"
      >
        {salesPeriods(today).map((preset) => (
          <Link
            key={preset.id}
            className={`period-shortcut ${period === preset.id ? "period-shortcut-active" : ""}`}
            href={`/app/sales?period=${preset.id}`}
            aria-current={period === preset.id ? "true" : undefined}
          >
            {preset.label}
          </Link>
        ))}
      </nav>
      <form className="report-filter" method="get" action="/app/sales">
        <label className="field">
          From
          <Input
            type="date"
            name="from"
            value={start}
            onChange={(event) => setStart(event.target.value)}
            required
          />
        </label>
        <label className="field">
          To
          <Input
            type="date"
            name="to"
            value={end}
            onChange={(event) => setEnd(event.target.value)}
            min={start}
            required
          />
        </label>
        <Button type="submit">Apply dates</Button>
      </form>
    </>
  );
}
