/**
 * @fileoverview Live, interactive demo island for the shared data toolkit
 * (`@/lib/data`, built on Remeda). Every panel imports the real helpers and
 * runs them in the browser against editable input, so the output you see is
 * genuinely computed — not a static code sample. This doubles as the working
 * proof that the toolkit is wired up and isomorphic.
 */

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { compact, diffArrays, groupBy, keyBy, sortBy, toggleInArray, unique, R } from "@/lib/data";

/** Parse a comma/space separated string into trimmed, non-empty tokens. */
function parseList(raw: string): string[] {
  return raw
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Small labelled output chip row used across the panels. */
function ChipRow({ label, items, tone }: { label: string; items: string[]; tone: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="w-20 shrink-0 pt-0.5 font-mono text-xs uppercase text-zinc-500">
        {label}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {items.length === 0 ? (
          <span className="text-xs italic text-zinc-600">∅ empty</span>
        ) : (
          items.map((item, i) => (
            <Badge key={`${item}-${i}`} className={tone}>
              {item}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

/** diffArrays — added / removed / common between two editable lists. */
function DiffPanel() {
  const [before, setBefore] = useState("apple, banana, cherry, date");
  const [after, setAfter] = useState("banana, cherry, elderberry, fig");
  const diff = useMemo(() => diffArrays(parseList(before), parseList(after)), [before, after]);

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="text-base">diffArrays(prev, next)</CardTitle>
        <CardDescription>
          What changed between two arrays — added, removed, unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label htmlFor="diff-before" className="space-y-1.5 text-xs text-zinc-400">
            <span>Before</span>
            <Input id="diff-before" value={before} onChange={(e) => setBefore(e.target.value)} />
          </label>
          <label htmlFor="diff-after" className="space-y-1.5 text-xs text-zinc-400">
            <span>After</span>
            <Input id="diff-after" value={after} onChange={(e) => setAfter(e.target.value)} />
          </label>
        </div>
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <ChipRow
            label="added"
            items={diff.added}
            tone="bg-green-950 text-green-400 border-green-800"
          />
          <ChipRow
            label="removed"
            items={diff.removed}
            tone="bg-red-950 text-red-400 border-red-800"
          />
          <ChipRow
            label="common"
            items={diff.common}
            tone="bg-zinc-800 text-zinc-300 border-zinc-700"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** toggleInArray — click chips to add/remove from a selection set. */
function TogglePanel() {
  const options = ["edge", "workers", "d1", "kv", "r2", "queues", "ai", "vectorize"];
  const [selected, setSelected] = useState<string[]>(["workers", "d1"]);

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="text-base">toggleInArray(items, value)</CardTitle>
        <CardDescription>
          Immutable add-if-absent / remove-if-present — perfect for selection state.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const on = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => setSelected((cur) => toggleInArray(cur, opt))}
                className={
                  "rounded-md border px-2.5 py-1 text-xs transition-colors " +
                  (on
                    ? "border-orange-600 bg-orange-950 text-orange-300"
                    : "border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600")
                }
              >
                {opt}
              </button>
            );
          })}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 font-mono text-xs text-zinc-300">
          selected = {JSON.stringify(selected)}
        </div>
      </CardContent>
    </Card>
  );
}

type Person = { name: string; team: string; commits: number };

const PEOPLE: Person[] = [
  { name: "ada", team: "platform", commits: 42 },
  { name: "linus", team: "platform", commits: 99 },
  { name: "grace", team: "frontend", commits: 31 },
  { name: "alan", team: "frontend", commits: 27 },
  { name: "katherine", team: "data", commits: 58 },
];

/** groupBy + sortBy + keyBy over a small fixed dataset. */
function GroupPanel() {
  const byTeam = useMemo(() => groupBy(PEOPLE, (p) => p.team), []);
  const ranked = useMemo(
    () =>
      R.pipe(
        PEOPLE,
        sortBy((p: Person) => -p.commits),
        R.take(3),
      ),
    [],
  );
  const byName = useMemo(() => keyBy(PEOPLE, (p) => p.name), []);

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="text-base">groupBy · sortBy · keyBy · pipe</CardTitle>
        <CardDescription>Compose Remeda primitives over a list of records.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="font-mono text-xs uppercase text-zinc-500">groupBy(team)</p>
          {Object.entries(byTeam).map(([team, members]) => (
            <ChipRow
              key={team}
              label={team}
              items={(members as Person[]).map((m) => m.name)}
              tone="bg-blue-950 text-blue-400 border-blue-800"
            />
          ))}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <p className="mb-2 font-mono text-xs uppercase text-zinc-500">
            top 3 by commits (sortBy + take)
          </p>
          <ChipRow
            label="ranked"
            items={ranked.map((p) => `${p.name}·${p.commits}`)}
            tone="bg-purple-950 text-purple-400 border-purple-800"
          />
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 font-mono text-xs text-zinc-400">
          keyBy(name).katherine.commits = {byName.katherine.commits}
        </div>
      </CardContent>
    </Card>
  );
}

/** unique + compact over a noisy editable list. */
function CleanPanel() {
  const [raw, setRaw] = useState("1, 2, 2, , 3, 3, 3, , 4");
  const tokens = parseList(raw);
  const cleaned = useMemo(() => unique(compact(parseList(raw))), [raw]);

  return (
    <Card className="border-zinc-800 bg-zinc-950">
      <CardHeader>
        <CardTitle className="text-base">unique(compact(items))</CardTitle>
        <CardDescription>
          Drop nullish/blank entries, then dedupe — one of the most common chores.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input value={raw} onChange={(e) => setRaw(e.target.value)} />
        <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
          <ChipRow label="input" items={tokens} tone="bg-zinc-800 text-zinc-400 border-zinc-700" />
          <ChipRow
            label="cleaned"
            items={cleaned}
            tone="bg-orange-950 text-orange-400 border-orange-800"
          />
        </div>
      </CardContent>
    </Card>
  );
}

/** Top-level grid of every live demo panel. */
export function UtilitiesDemo() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <DiffPanel />
      <TogglePanel />
      <GroupPanel />
      <CleanPanel />
    </div>
  );
}
