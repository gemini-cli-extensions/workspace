/**
 * @fileoverview ProjectCard — a single project tile for the ProjectList grid
 * (covers the hextaui "project-list" / "team-projects" card). Shows the accent
 * color dot, name, status badge, task count, owner, updated-relative time, and
 * a star toggle wired to `POST /api/projects/{id}/star`.
 */

import { FolderIcon, StarIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";

import { ProjectStatusBadge } from "./StatusBadge";
import type { Project } from "./types";

export interface ProjectCardProps {
  project: Project;
  /** Toggle the star; receives the project id. Optimistic at the parent. */
  onToggleStar: (project: Project) => void;
  /** Open the project preview modal. */
  onOpen: (project: Project) => void;
  /** Whether a star request is currently in flight for this project. */
  starPending?: boolean;
}

export function ProjectCard({ project, onToggleStar, onOpen, starPending }: ProjectCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Open project ${project.name}`}
      onClick={() => onOpen(project)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(project);
        }
      }}
      className="cursor-pointer transition-colors hover:bg-card/80"
    >
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="size-3 shrink-0 rounded-full ring-1 ring-foreground/10"
              style={{ backgroundColor: project.color }}
            />
            <span className="truncate text-sm font-medium">{project.name}</span>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={project.starred ? "Unstar project" : "Star project"}
            aria-pressed={project.starred}
            disabled={starPending}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(project);
            }}
          >
            <StarIcon
              className={cn(
                "size-4",
                project.starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground",
              )}
            />
          </Button>
        </div>

        {project.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground/60 italic">No description</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <ProjectStatusBadge status={project.status} />
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <FolderIcon className="size-3.5" />
            {project.taskCount} {project.taskCount === 1 ? "task" : "tasks"}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{project.owner}</span>
          <span>Updated {relativeTime(project.updatedAt)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
