/**
 * @file gmail/label-sync.ts
 * @description Pure reconciliation logic between Gmail's live label list and the
 * `gmail_labels` D1 registry. No network/DB — feed it both lists, get the set of
 * changes to apply. Keeps the sync tool and the weekly cron on identical rules.
 */

export interface LabelLite {
  id: string;
  name: string;
}

export interface D1LabelLite {
  id: string;
  isActive: boolean;
}

export interface LabelDiff {
  /** In Gmail, absent from D1 → insert. */
  toRegister: LabelLite[];
  /** In Gmail and in D1 but soft-deleted → flip isActive back to 1. */
  toReactivate: string[];
  /** Active in D1 but gone from Gmail → soft-delete (isActive = 0). */
  toSoftDelete: string[];
}

export function diffLabels(gmail: LabelLite[], d1: D1LabelLite[]): LabelDiff {
  const gmailIds = new Set(gmail.map((l) => l.id));
  const d1ById = new Map(d1.map((l) => [l.id, l]));
  return {
    toRegister: gmail.filter((l) => !d1ById.has(l.id)),
    toReactivate: gmail.filter((l) => d1ById.get(l.id)?.isActive === false).map((l) => l.id),
    toSoftDelete: d1.filter((l) => l.isActive && !gmailIds.has(l.id)).map((l) => l.id),
  };
}

/**
 * Gmail nests labels by name convention ("Parent/Child"). Resolve a label's
 * parent id from its name path, given a name→id map of all labels.
 */
export function parentIdFor(name: string, idByName: Map<string, string>): string | null {
  const slash = name.lastIndexOf("/");
  if (slash < 0) return null;
  return idByName.get(name.slice(0, slash)) ?? null;
}
