"use client";
import { useEffect, useRef, useState } from "react";
import { salesCsv, type ExportKind, type SalesReport } from "@/lib/sales/csv";
import { summarize } from "@/lib/sales/domain";
import { Dialog } from "./ui/dialog";
import { Button } from "./ui/button";
import { Icon } from "./ui/icon";
import { useFeedback } from "./ui/feedback";

const options: { value: ExportKind; label: string; description: string }[] = [
  {
    value: "summary",
    label: "Profit summary",
    description: "Revenue, costs, expenses and profit.",
  },
  {
    value: "sales",
    label: "Sales history",
    description: "Receipts, payments, costs and refunds.",
  },
  {
    value: "expenses",
    label: "Operating expenses",
    description: "All expenses, including voided entries.",
  },
];

export function ExportSales({ report }: { report: SalesReport }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ExportKind>("summary");
  const [error, setError] = useState("");
  const errorMessage = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (error) errorMessage.current?.focus();
  }, [error]);
  const notify = useFeedback();
  const missing = summarize(report.sales, report.expenses).missingCosts;
  function download() {
    setError("");
    let url: string | undefined;
    const anchor = document.createElement("a");
    try {
      url = URL.createObjectURL(
        new Blob([salesCsv(kind, report)], { type: "text/csv;charset=utf-8" }),
      );
      anchor.href = url;
      anchor.download = `${kind}-${report.from}_${report.to}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      setOpen(false);
      notify(
        `${options.find((option) => option.value === kind)!.label} CSV download started.`,
        "Download started",
      );
    } catch {
      setError(
        "The CSV could not be prepared. Close this dialog, refresh Sales and try again.",
      );
    } finally {
      anchor.remove();
      if (url) {
        const downloadUrl = url;
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
      }
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setKind("summary");
          setError("");
          setOpen(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="download" size={18} />
        Export CSV
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Export sales data"
        className="export-dialog"
        description="Choose a CSV file to keep your own records or open in a spreadsheet."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            download();
          }}
        >
          <div className="dialog-body">
            <div className="mb-6 rounded-md border border-border bg-secondary/40 p-4 text-sm">
              <p className="font-semibold">
                {report.from} — {report.to}
              </p>
              <p className="mt-1 text-muted-foreground">
                {report.sales.length}{" "}
                {report.sales.length === 1 ? "receipt" : "receipts"} ·{" "}
                {report.expenses.length}{" "}
                {report.expenses.length === 1 ? "expense" : "expenses"}·{" "}
                {report.timezone}
              </p>
            </div>
            <fieldset className="min-w-0 space-y-3">
              <legend className="mb-3 text-sm font-semibold">
                Choose a file
              </legend>
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-start gap-3 rounded-md border border-input p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                >
                  <input
                    type="radio"
                    name="export"
                    value={option.value}
                    checked={kind === option.value}
                    onChange={() => setKind(option.value)}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand)]"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {option.label}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="mt-5 text-sm text-muted-foreground">
              PHP amounts · All records in the applied dates, including those
              hidden by search.
            </p>
            {missing > 0 && (
              <p className="mt-3 text-sm text-destructive">
                {missing} sale(s) have missing costs. Profit stays blank and is
                marked incomplete in the CSV.
              </p>
            )}
            {error && (
              <p
                ref={errorMessage}
                tabIndex={-1}
                role="alert"
                className="form-message error mt-3"
              >
                {error}
              </p>
            )}
          </div>
          <div className="dialog-actions">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              <Icon name="download" size={18} />
              Download CSV
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
