/**
 * @fileoverview TasksPage — the /agent-tasks island shell.
 *
 * Composes the TaskWizard (create) above the TaskList (manage) in a single
 * island so creating a task can refresh the list without cross-island wiring.
 */

"use client";

import * as React from "react";

import { TaskList, type TaskListHandle } from "./TaskList";
import { TaskWizard } from "./TaskWizard";

export function TasksPage() {
  const listRef = React.useRef<TaskListHandle>(null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-10 p-4 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Scheduled Tasks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Schedule a Workspace action against one or more accounts — on demand, once, on an
          interval, or on a cron schedule. Optionally index results in D1 and embed into RAG.
        </p>
      </header>

      <section aria-labelledby="new-task">
        <h2 id="new-task" className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase">
          New task
        </h2>
        <TaskWizard onCreated={() => listRef.current?.reload()} />
      </section>

      <section aria-labelledby="existing-tasks">
        <h2
          id="existing-tasks"
          className="mb-3 text-sm font-medium tracking-wide text-muted-foreground uppercase"
        >
          Scheduled tasks
        </h2>
        <TaskList ref={listRef} />
      </section>
    </div>
  );
}
