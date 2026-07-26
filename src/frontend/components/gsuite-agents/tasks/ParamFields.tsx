/**
 * @fileoverview ParamFields — renders a form from an action's `params` array.
 *
 * Field mapping per the contract:
 *   string  -> Input
 *   number  -> Input[type=number]
 *   text    -> Textarea
 *   enum    -> Select
 *   boolean -> Switch
 */

"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { ActionDef, ParamDef } from "@/lib/scheduler-api";

export function ParamFields({
  action,
  values,
  onChange,
}: {
  action: ActionDef;
  values: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}) {
  if (action.params.length === 0) {
    return (
      <p className="rounded-lg bg-card px-4 py-6 text-sm text-muted-foreground ring-1 ring-border/40">
        This action takes no parameters. Continue to set its schedule.
      </p>
    );
  }

  return (
    <div className="grid gap-5">
      {action.params.map((param) => (
        <ParamField
          key={param.name}
          param={param}
          value={values[param.name]}
          onChange={(v) => onChange(param.name, v)}
        />
      ))}
    </div>
  );
}

function ParamField({
  param,
  value,
  onChange,
}: {
  param: ParamDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const fieldId = `param-${param.name}`;

  return (
    <div className="grid gap-2">
      <Label htmlFor={fieldId} className="text-foreground">
        {param.label}
        {param.required ? <span className="text-destructive">*</span> : null}
      </Label>

      {param.type === "text" ? (
        <Textarea
          id={fieldId}
          value={typeof value === "string" ? value : ""}
          placeholder={param.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-24"
        />
      ) : param.type === "enum" ? (
        <Select
          value={typeof value === "string" ? value : ""}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger id={fieldId} className="w-full">
            <SelectValue placeholder={param.placeholder ?? "Choose an option"} />
          </SelectTrigger>
          <SelectContent>
            {(param.enumValues ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : param.type === "boolean" ? (
        <div className="flex items-center gap-3 rounded-lg bg-card px-3 py-2.5 ring-1 ring-border/40">
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
          />
          <span className="text-sm text-muted-foreground">
            {Boolean(value) ? "Enabled" : "Disabled"}
          </span>
        </div>
      ) : (
        <Input
          id={fieldId}
          type={param.type === "number" ? "number" : "text"}
          value={value == null ? "" : String(value)}
          placeholder={param.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
