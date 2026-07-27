/**
 * @fileoverview Barrel for the settings feature islands + shared primitives.
 *
 * Astro pages import the hydrated islands from here so the page front-matter
 * stays thin. The shared row/section primitives are re-exported for any future
 * settings surface that wants the same Monolith "settings row" pattern.
 */

export { SettingsNav, SETTINGS_SECTIONS } from "./SettingsNav";
export { PreferencesForm } from "./PreferencesForm";
export { NotificationPrefsMatrix } from "./NotificationPrefsMatrix";
export { WebhooksTable } from "./WebhooksTable";
export { ActivityTimeline } from "./ActivityTimeline";
export { AdvancedPanel } from "./AdvancedPanel";
export { SendTestNotification } from "./SendTestNotification";

export {
  SettingsRow,
  SettingsRowGroup,
  SectionHeader,
  SavedFlash,
  InlineError,
  RowSkeleton,
  useSavedFlash,
} from "./shared";
