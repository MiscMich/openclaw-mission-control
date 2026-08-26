"use client";

import { memo } from "react";
import { Button, MappedIcon } from "@/components/ui";
import { cn } from "@/lib/utils";

interface PaginationControlsProps {
  currentPage: number;
  totalPages?: number;
  hasMore?: boolean;
  isLoading?: boolean;
  onPreviousPage: () => void;
  onNextPage: () => void;
  onLoadMore?: () => void;
  className?: string;
  showLoadMore?: boolean;
  total?: number;
  pageSize?: number;
}

export const PaginationControls = memo(function PaginationControls({
  currentPage,
  totalPages,
  hasMore = false,
  isLoading = false,
  onPreviousPage,
  onNextPage,
  onLoadMore,
  className,
  showLoadMore = false,
  total,
  pageSize = 50,
}: PaginationControlsProps) {
  const canGoPrevious = currentPage > 1;
  const canGoNext = totalPages ? currentPage < totalPages : hasMore;

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total ?? start + pageSize - 1);

  if (showLoadMore && onLoadMore) {
    return (
      <div className={cn("flex flex-col items-center gap-2 py-4", className)}>
        {total !== undefined && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Showing {end} of {total} items
          </p>
        )}
        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            loading={isLoading}
            className="gap-2"
          >
            <MappedIcon name="refresh" size="xs" />
            Load More
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between gap-3 py-4",
        className
      )}
    >
      {/* Info */}
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        {total !== undefined ? (
          <span>
            Showing {start}-{end} of {total}
          </span>
        ) : totalPages !== undefined ? (
          <span>
            Page {currentPage} of {totalPages}
          </span>
        ) : (
          <span>Page {currentPage}</span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPreviousPage}
          disabled={!canGoPrevious || isLoading}
          className="gap-2"
        >
          <MappedIcon name="arrowLeft" size="xs" />
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onNextPage}
          disabled={!canGoNext || isLoading}
          className="gap-2"
        >
          Next
          <MappedIcon name="arrowRight" size="xs" />
        </Button>
      </div>
    </div>
  );
});
