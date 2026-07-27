/**
 * @fileoverview PreferencesForm — Appearance, Language & Region, and
 * Accessibility preferences editor.
 *
 * Loads the single 'default' preferences row from `GET /api/settings/preferences`
 * and persists edits with `PUT /api/settings/preferences`. All fields are
 * optional on the wire; we send the full working copy on save. Errors are
 * surfaced inline via `ApiError.message`; a transient "Saved" flash confirms
 * success.
 *
 * Monolith dark profile: shadcn Card/Select/Switch primitives, settings rows
 * divided by `divide-border/40`, no traditional 1px borders.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import { apiGet, ApiError, apiSend } from "@/lib/api";

import {
  InlineError,
  RowSkeleton,
  SavedFlash,
  SectionHeader,
  SettingsRow,
  SettingsRowGroup,
  useSavedFlash,
} from "./shared";

// ---------------------------------------------------------------------------
// Wire types — mirror `selectPreferencesSchema` (createdAt omitted; we only
// read/write the editable surface).
// ---------------------------------------------------------------------------

interface Preferences {
  id: string;
  theme: string;
  accentColor: string;
  fontSize: string;
  density: string;
  language: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  numberFormat: string;
  animations: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  screenReader: boolean;
  keyboardShortcuts: boolean;
  updatedAt: string | number | Date;
}

/** Body accepted by PUT /api/settings/preferences (all fields optional). */
type PreferencesPatch = Partial<Omit<Preferences, "id" | "updatedAt">>;

// ---------------------------------------------------------------------------
// Option lists
// ---------------------------------------------------------------------------

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const FONT_SIZE_OPTIONS = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
];

const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "ja", label: "日本語" },
];

const TIMEZONE_OPTIONS = [
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "America/Los_Angeles", label: "America/Los_Angeles" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "Europe/Berlin", label: "Europe/Berlin" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
];

const DATE_FORMAT_OPTIONS = [
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
];

const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12-hour" },
  { value: "24h", label: "24-hour" },
];

const NUMBER_FORMAT_OPTIONS = [
  { value: "en-US", label: "1,234.56 (en-US)" },
  { value: "de-DE", label: "1.234,56 (de-DE)" },
  { value: "fr-FR", label: "1 234,56 (fr-FR)" },
];

/** Accessibility toggle definitions: key + label + description. */
const ACCESSIBILITY_TOGGLES: {
  key: keyof Pick<
    Preferences,
    "animations" | "reducedMotion" | "highContrast" | "screenReader" | "keyboardShortcuts"
  >;
  label: string;
  description: string;
}[] = [
  {
    key: "animations",
    label: "Animations",
    description: "Enable CSS transitions and motion across the interface.",
  },
  {
    key: "reducedMotion",
    label: "Reduced motion",
    description: "Honor the operating system's reduced-motion preference.",
  },
  {
    key: "highContrast",
    label: "High contrast",
    description: "Increase contrast of text and controls for legibility.",
  },
  {
    key: "screenReader",
    label: "Screen reader optimizations",
    description: "Emit richer ARIA markup tuned for assistive technology.",
  },
  {
    key: "keyboardShortcuts",
    label: "Keyboard shortcuts",
    description: "Enable global keyboard shortcut bindings.",
  },
];

// ---------------------------------------------------------------------------
// A reusable labeled <Select> row bound to a preferences field.
// ---------------------------------------------------------------------------

function SelectRow({
  id,
  label,
  description,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <SettingsRow
      label={label}
      description={description}
      htmlFor={id}
      control={
        <Select
          value={value}
          onValueChange={(next) => {
            if (typeof next === "string") onChange(next);
          }}
        >
          <SelectTrigger id={id} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PreferencesForm() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, flashSaved] = useSavedFlash();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await apiGet<Preferences>("settings/preferences");
      setPrefs(row);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load preferences.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Apply a partial patch to the in-memory working copy. */
  const update = useCallback((patch: PreferencesPatch) => {
    setPrefs((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const save = useCallback(async () => {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const body: PreferencesPatch = {
        theme: prefs.theme,
        accentColor: prefs.accentColor,
        fontSize: prefs.fontSize,
        density: prefs.density,
        language: prefs.language,
        timezone: prefs.timezone,
        dateFormat: prefs.dateFormat,
        timeFormat: prefs.timeFormat,
        numberFormat: prefs.numberFormat,
        animations: prefs.animations,
        reducedMotion: prefs.reducedMotion,
        highContrast: prefs.highContrast,
        screenReader: prefs.screenReader,
        keyboardShortcuts: prefs.keyboardShortcuts,
      };
      const updated = await apiSend<Preferences>("PUT", "settings/preferences", body);
      setPrefs(updated);
      flashSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  }, [prefs, flashSaved]);

  return (
    <Card className="bg-card ring-1 ring-border/40">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Preferences</CardTitle>
          <CardDescription>
            Tune the appearance, locale, and accessibility of your workspace.
          </CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SavedFlash show={saved} />
          <Button onClick={save} disabled={saving || loading || !prefs} size="sm">
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-10">
        <InlineError message={error} />

        {loading || !prefs ? (
          <div className="divide-y divide-border/40">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        ) : (
          <>
            {/* Appearance ---------------------------------------------------- */}
            <section className="space-y-2">
              <SectionHeader
                title="Appearance"
                description="Theme, accent, and layout density."
              />
              <SettingsRowGroup>
                <SelectRow
                  id="pref-theme"
                  label="Theme"
                  description="Color scheme used across the interface."
                  value={prefs.theme}
                  options={THEME_OPTIONS}
                  onChange={(theme) => update({ theme })}
                />
                <SettingsRow
                  label="Accent color"
                  description="Hex accent applied to highlights and primary actions."
                  htmlFor="pref-accent"
                  control={
                    <div className="flex items-center gap-2">
                      <input
                        id="pref-accent"
                        type="color"
                        aria-label="Accent color"
                        value={prefs.accentColor}
                        onChange={(e) => update({ accentColor: e.target.value })}
                        className="size-9 cursor-pointer rounded-md bg-transparent ring-1 ring-border/40"
                      />
                      <Input
                        aria-label="Accent color hex"
                        value={prefs.accentColor}
                        onChange={(e) => update({ accentColor: e.target.value })}
                        spellCheck={false}
                        className="w-28 font-mono"
                      />
                    </div>
                  }
                />
                <SelectRow
                  id="pref-fontsize"
                  label="Font size"
                  description="Base font size token."
                  value={prefs.fontSize}
                  options={FONT_SIZE_OPTIONS}
                  onChange={(fontSize) => update({ fontSize })}
                />
                <SelectRow
                  id="pref-density"
                  label="Density"
                  description="Spacing between interface elements."
                  value={prefs.density}
                  options={DENSITY_OPTIONS}
                  onChange={(density) => update({ density })}
                />
              </SettingsRowGroup>
            </section>

            {/* Language & Region -------------------------------------------- */}
            <section className="space-y-2">
              <SectionHeader
                title="Language & Region"
                description="Locale, timezone, and formatting."
              />
              <SettingsRowGroup>
                <SelectRow
                  id="pref-language"
                  label="Language"
                  description="Interface language."
                  value={prefs.language}
                  options={LANGUAGE_OPTIONS}
                  onChange={(language) => update({ language })}
                />
                <SelectRow
                  id="pref-timezone"
                  label="Timezone"
                  description="Used to render dates and times."
                  value={prefs.timezone}
                  options={TIMEZONE_OPTIONS}
                  onChange={(timezone) => update({ timezone })}
                />
                <SelectRow
                  id="pref-dateformat"
                  label="Date format"
                  description="How calendar dates are displayed."
                  value={prefs.dateFormat}
                  options={DATE_FORMAT_OPTIONS}
                  onChange={(dateFormat) => update({ dateFormat })}
                />
                <SelectRow
                  id="pref-timeformat"
                  label="Time format"
                  description="12- or 24-hour clock."
                  value={prefs.timeFormat}
                  options={TIME_FORMAT_OPTIONS}
                  onChange={(timeFormat) => update({ timeFormat })}
                />
                <SelectRow
                  id="pref-numberformat"
                  label="Number format"
                  description="Locale used for grouping and decimals."
                  value={prefs.numberFormat}
                  options={NUMBER_FORMAT_OPTIONS}
                  onChange={(numberFormat) => update({ numberFormat })}
                />
              </SettingsRowGroup>
            </section>

            {/* Accessibility ------------------------------------------------- */}
            <section className="space-y-2">
              <SectionHeader
                title="Accessibility"
                description="Motion, contrast, and assistive technology support."
              />
              <SettingsRowGroup>
                {ACCESSIBILITY_TOGGLES.map((toggle) => (
                  <SettingsRow
                    key={toggle.key}
                    label={toggle.label}
                    description={toggle.description}
                    control={
                      <Switch
                        aria-label={toggle.label}
                        checked={prefs[toggle.key]}
                        onCheckedChange={(checked) => update({ [toggle.key]: checked })}
                      />
                    }
                  />
                ))}
              </SettingsRowGroup>
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
