/**
 * @fileoverview Breadcrumb — a minimal, dependency-free breadcrumb trail for the
 * Monolith dark surface. Base-UI ships no breadcrumb primitive, so this is a
 * small set of plain semantic elements (`<nav><ol><li>`) styled to match the
 * rest of the system: muted crumbs, a `foreground` current page, and chevron
 * separators. No 1px borders, no external deps.
 *
 * Composition mirrors the shadcn breadcrumb API so it reads familiarly:
 *
 *   <Breadcrumb>
 *     <BreadcrumbList>
 *       <BreadcrumbItem><BreadcrumbLink href="/tasks">Tasks</BreadcrumbLink></BreadcrumbItem>
 *       <BreadcrumbSeparator />
 *       <BreadcrumbItem><BreadcrumbPage>Current</BreadcrumbPage></BreadcrumbItem>
 *     </BreadcrumbList>
 *   </Breadcrumb>
 */

import { type ComponentProps, type ReactNode } from "react";
import { ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** The landmark `<nav>` wrapper. */
export function Breadcrumb({ className, ...props }: ComponentProps<"nav">) {
  return <nav aria-label="Breadcrumb" className={className} {...props} />;
}

/** The ordered list of crumbs. Wraps gracefully on narrow viewports. */
export function BreadcrumbList({ className, ...props }: ComponentProps<"ol">) {
  return (
    <ol
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** A single crumb slot. */
export function BreadcrumbItem({ className, ...props }: ComponentProps<"li">) {
  return <li className={cn("inline-flex items-center gap-1.5", className)} {...props} />;
}

/** A linked (navigable) crumb. */
export function BreadcrumbLink({ className, ...props }: ComponentProps<"a">) {
  return (
    <a
      className={cn(
        "truncate transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
        className,
      )}
      {...props}
    />
  );
}

/** The final, non-navigable crumb (the current page). */
export function BreadcrumbPage({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      aria-current="page"
      className={cn("truncate font-medium text-foreground", className)}
      {...props}
    />
  );
}

/** Chevron separator between crumbs. */
export function BreadcrumbSeparator({
  children,
  className,
  ...props
}: ComponentProps<"li"> & { children?: ReactNode }) {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5 text-muted-foreground/60", className)}
      {...props}
    >
      {children ?? <ChevronRightIcon />}
    </li>
  );
}
