/**
 * @fileoverview `ChartCard` — a titled Card shell shared by every chart panel.
 *
 * Standardises the chrome around each recharts figure (title, description,
 * optional header slot) and the LOADING / ERROR / EMPTY states so the chart
 * components themselves only describe the figure. Monolith styling: `bg-card`
 * surface, ring-based separation, fixed-aspect chart body.
 */

"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { EmptyState, InlineError } from "./shared";

export interface ChartCardProps {
  title: string;
  description?: string;
  /** True while the parent charts request is in flight. */
  loading: boolean;
  /** Inline error message (from `ApiError`) if the request failed. */
  error: string | null;
  /** Retry handler wired to the charts resource. */
  onRetry: () => void;
  /** Whether the underlying dataset has any rows. */
  hasData: boolean;
  /** Optional element rendered on the right of the header (e.g. a legend hint). */
  headerSlot?: React.ReactNode;
  /** Empty-state copy when the dataset is present but contains no rows. */
  emptyLabel?: string;
  children: React.ReactNode;
}

export function ChartCard({
  title,
  description,
  loading,
  error,
  onRetry,
  hasData,
  headerSlot,
  emptyLabel = "No data in this range yet.",
  children,
}: ChartCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {headerSlot}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {error ? (
          <InlineError message={error} onRetry={onRetry} />
        ) : loading ? (
          <Skeleton className="aspect-video w-full" />
        ) : hasData ? (
          children
        ) : (
          <EmptyState label={emptyLabel} className="aspect-video justify-center" />
        )}
      </CardContent>
    </Card>
  );
}
