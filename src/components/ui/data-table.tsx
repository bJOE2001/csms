"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icon";
import { Button } from "./button";
import { Input } from "./primitives/input";
import { DataTablePagination, type TablePageSize } from "./data-table-pagination";
import { useLoadingSignal } from "./global-loading-bar";
import { Skeleton } from "./workspace-skeleton";
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
  paginationResetKey = "",
  isLoading = false,
  searchable = true,
  paginate = true,
}: {
  caption: string;
  columns: {
    key: string;
    label: string;
    sortable?: boolean;
    numeric?: boolean;
    kind?: "primary" | "text" | "compact" | "status" | "actions";
  }[];
  rows: DataRow[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  toolbarLeading?: ReactNode;
  actions?: ReactNode;
  paginationResetKey?: string;
  isLoading?: boolean;
  searchable?: boolean;
  paginate?: boolean;
}) {
  useLoadingSignal(isLoading);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const [pageSize, setPageSize] = useState<TablePageSize>(10);
  const criteria = JSON.stringify([query, sort?.key, sort?.descending, paginationResetKey]);
  const [pagination, setPagination] = useState({ page: 1, criteria });
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
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = pagination.criteria === criteria
    ? Math.min(pagination.page, pageCount)
    : 1;
  // Synchronize during render so filters and deletions never show an empty old page.
  if (pagination.page !== page || pagination.criteria !== criteria)
    setPagination({ page, criteria });
  const visible = paginate ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered;
  return (
    <div className="data-table" aria-busy={isLoading || undefined}>
      <div className="data-toolbar">
        {toolbarLeading && (
          <div className="data-toolbar-leading">{toolbarLeading}</div>
        )}
        {searchable && <label className="table-search input-group">
          <Icon name="search" size={18} />
          <span className="sr-only">{searchPlaceholder}</span>
          <Input
            className="h-11 border-0 bg-transparent p-0"
            focusOwner="parent"
            type="search"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-controls={id}
          />
        </label>}
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
                  className={`table-cell-${column.kind ?? (column.numeric ? "numeric" : "text")} ${column.numeric ? "numeric" : ""}`}
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
            {visible.map((row) => (
              <TableRow key={row.id}>
                {columns.map((column) => (
                  <TableCell
                    key={column.key}
                    data-label={column.label}
                    className={`table-cell-${column.kind ?? (column.numeric ? "numeric" : "text")} ${column.numeric ? "numeric" : ""}`}
                  >
                    <div className="table-cell-content">{row.cells[column.key]}</div>
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {isLoading && !rows.length && <div className="table-skeleton" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => <Skeleton className="skeleton-row" key={i} />)}
        </div>}
        {!isLoading && !filtered.length && (
          <div className="table-empty">
            <Icon name="search" size={26} />
            <p>
              {rows.length
                ? "No matching records. Try a different search."
                : emptyMessage}
            </p>
            {!isLoading && query && (
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
        {paginate && <DataTablePagination
          page={page}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={next => setPagination({ page: next, criteria })}
          onPageSizeChange={size => {
            setPageSize(size);
            setPagination({ page: 1, criteria });
          }}
          isLoading={isLoading}
          label={`${caption} pagination`}
          tableId={id}
        />}
        {overflowing && (
          <p className="table-scroll-hint" id={`${id}-scroll-hint`}>
            Scroll across for more columns <Icon name="arrow" size={14} />
          </p>
        )}
      </div>
    </div>
  );
}
