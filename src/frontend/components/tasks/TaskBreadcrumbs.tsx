/**
 * @fileoverview TaskBreadcrumbs — the ancestor trail rendered at the top of the
 * task viewport. It fetches the parent-chain from the backend and renders a
 * "Tasks / <root> / … / <parent> / <current>" trail where every ancestor is a
 * link to `/tasks/{ancestorId}` and the current task title is the final,
 * non-navigable crumb.
 *
 * Source of truth:
 *   GET /api/tasks/{id}/ancestors → { data: {id,title}[] } ordered root→parent
 *   (excludes self; `[]` for a top-level task).
 *
 * A top-level task therefore renders just "Tasks / <current title>". While the
 * ancestors are loading we render only the stable "Tasks" root + current title
 * so the trail never flickers a spinner into the layout.
 */

"use client";

import { useEffect, useState } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { apiGet } from "@/lib/api";

/** A single ancestor crumb returned by the ancestors endpoint. */
interface Ancestor {
  id: string;
  title: string;
}

export interface TaskBreadcrumbsProps {
  /** The current task's id (used to fetch its ancestor chain). */
  taskId: string;
  /** The current task's title (rendered as the final, non-link crumb). */
  title: string;
}

/**
 * Fetches `GET /api/tasks/{id}/ancestors` and renders the trail. Ancestor fetch
 * failures fail silent — the trail simply degrades to "Tasks / <current>" — so a
 * transient error never blocks the viewport from rendering.
 */
export function TaskBreadcrumbs({ taskId, title }: TaskBreadcrumbsProps) {
  const [ancestors, setAncestors] = useState<Ancestor[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiGet<{ data: Ancestor[] }>(`tasks/${taskId}/ancestors`);
        if (!cancelled) setAncestors(res.data ?? []);
      } catch {
        // Degrade gracefully to "Tasks / <current title>".
        if (!cancelled) setAncestors([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/tasks">Tasks</BreadcrumbLink>
        </BreadcrumbItem>
        {ancestors.map((ancestor) => (
          <BreadcrumbItem key={ancestor.id}>
            <BreadcrumbSeparator />
            <BreadcrumbLink
              href={`/tasks/${ancestor.id}`}
              className="max-w-[12rem]"
              title={ancestor.title}
            >
              {ancestor.title}
            </BreadcrumbLink>
          </BreadcrumbItem>
        ))}
        <BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbPage className="max-w-[16rem]" title={title}>
            {title}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
