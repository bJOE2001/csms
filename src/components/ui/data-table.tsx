"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";
import { Button } from "./button";
import { Input } from "./primitives/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "./primitives/table";

export type DataRow = {
  id: string;
  search: string;
  cells: Record<string, ReactNode>;
  sort?: Record<string, string | number>;
};
export function DataTable({
  caption,
  columns,
  rows,
  searchPlaceholder = "Search records",
  emptyMessage = "No records yet.",
  toolbarLeading,
  actions,
}: {
  caption: string;
  columns: {
    key: string;
    label: string;
    sortable?: boolean;
    numeric?: boolean;
  }[];
  rows: DataRow[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  toolbarLeading?: ReactNode;
  actions?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const id = useId();
  const scrollRegion = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useEffect(() => {
    const region = scrollRegion.current;
    if (!region) return;
    const measure = () =>
      setOverflowing(region.scrollWidth > region.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    const table = region.querySelector("table");
    if (table) observer.observe(table);
    measure();
    return () => observer.disconnect();
  }, []);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = rows.filter((row) =>
    terms.every((term) => row.search.toLowerCase().includes(term)),
  );
  if (sort)
    filtered.sort((a, b) => {
      const left = a.sort?.[sort.key] ?? "",
        right = b.sort?.[sort.key] ?? "";
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, {
              numeric: true,
            });
      return sort.descending ? -order : order;
    });
  return (
    <div className="data-table">
      <div className="data-toolbar">
        {toolbarLeading && (
          <div className="data-toolbar-leading">{toolbarLeading}</div>
        )}
        <label className="table-search">
          <Icon name="search" size={18} />
          <span className="sr-only">{searchPlaceholder}</span>
          <Input
            className="h-11 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
            type="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-controls={id}
          />
        </label>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      <div
        ref={scrollRegion}
        className="table-scroll"
        role="region"
        aria-label={caption}
        aria-describedby={overflowing ? `${id}-scroll-hint` : undefined}
        tabIndex={0}
      >
        <Table id={id}>
          <TableCaption className="sr-only">{caption}</TableCaption>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead
                  scope="col"
                  key={column.key}
                  className={column.numeric ? "numeric" : undefined}
                  aria-sort={
                    column.sortable
                      ? sort?.key === column.key
                        ? sort.descending
                          ? "descending"
                          : "ascending"
                        : "none"
                      : undefined
                  }
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() =>
                        setSort((current) => ({
                          key: column.key,
                          descending:
                            current?.key === column.key
                              ? !current.descending
                              : false,
                        }))
                      }
                    >
                      {column.label}
                      <span aria-hidden="true">
                        {sort?.key === column.key
                          ? sort.descending
                            ? "↓"
                            : "↑"
                          : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((row) => (
              <TableRow key={row.id}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    data-label={column.label}
                    className={column.numeric ? "numeric" : undefined}
                  >
                    {row.cells[column.key]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!filtered.length && (
          <div className="table-empty">
            <Icon name="search" size={26} />
            <p>
              {rows.length
                ? "No matching records. Try a different search."
                : emptyMessage}
            </p>
            {query && (
              <Button
                className="secondary compact"
                onClick={() => setQuery("")}
              >
                Clear search
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="data-table-footer">
        <p className="table-count" role="status">
          {filtered.length} of {rows.length}{" "}
          {rows.length === 1 ? "record" : "records"}
        </p>
        {overflowing && (
          <p className="table-scroll-hint" id={`${id}-scroll-hint`}>
            Scroll across for more columns <Icon name="arrow" size={14} />
          </p>
        )}
      </div>
    </div>
  );
}
