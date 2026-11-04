"use client";

import { useId } from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "./select";
import { TableActionButton } from "./table-action-button";

export type TablePageSize = 10 | 25 | 50;

/** Controlled, one-based pagination for the table's matching records. */
export function DataTablePagination({
  page, pageSize, totalItems, onPageChange, onPageSizeChange,
  isLoading = false, label = "Table pagination", tableId,
}: {
  page: number;
  pageSize: TablePageSize;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: TablePageSize) => void;
  isLoading?: boolean;
  label?: string;
  tableId?: string;
}) {
  const selectId = useId();
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.max(1, Math.min(page, pageCount));
  const start = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalItems);
  return (
    <nav className="data-table-pagination" aria-label={label} aria-busy={isLoading || undefined}>
      <div className="table-page-size">
        <label htmlFor={selectId}>Rows per page</label>
        <Select
          id={selectId}
          size="compact"
          value={String(pageSize)}
          onValueChange={value => onPageSizeChange(Number(value) as TablePageSize)}
          options={[10, 25, 50].map(value => ({ value: String(value), label: String(value) }))}
          disabled={isLoading}
        />
      </div>
      <p className="table-count" role="status" aria-atomic="true">
        {isLoading ? "Loading records…" : <>
          {start}–{end} of {totalItems}
          <span className="sr-only"> matching records. Page {currentPage} of {pageCount}.</span>
        </>}
      </p>
      <div className="table-pagination-actions">
        <TableActionButton icon={ChevronFirst} label="First page" aria-controls={tableId}
          disabled={isLoading || currentPage === 1} onClick={() => onPageChange(1)} />
        <TableActionButton icon={ChevronLeft} label="Previous page" aria-controls={tableId}
          disabled={isLoading || currentPage === 1} onClick={() => onPageChange(currentPage - 1)} />
        <span className="table-page-number" aria-hidden="true">{currentPage} / {pageCount}</span>
        <TableActionButton icon={ChevronRight} label="Next page" aria-controls={tableId}
          disabled={isLoading || currentPage === pageCount} onClick={() => onPageChange(currentPage + 1)} />
        <TableActionButton icon={ChevronLast} label="Last page" aria-controls={tableId}
          disabled={isLoading || currentPage === pageCount} onClick={() => onPageChange(pageCount)} />
      </div>
    </nav>
  );
}
