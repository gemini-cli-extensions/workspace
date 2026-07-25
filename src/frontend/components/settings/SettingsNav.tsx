/**
 * @fileoverview SettingsNav — shared left sub-navigation for the settings area.
 *
 * Renders the five settings sections (Preferences / Notifications / Webhooks /
 * Activity / Advanced) as a vertical nav on desktop and a horizontal scroller
 * on mobile. Each entry is a plain anchor pointing at a static Astro route under
 * `/settings/*`, so the active section is derived from the current pathname at
 * render time (works for both SSR and the hydrated island).
 *
 * Monolith dark profile: no 1px borders — the active row is differentiated with
 * `bg-muted` + `ring-1 ring-border/40`, inactive rows are muted-foreground.
 */

"use client";

import {
  ActivityIcon,
  BellIcon,
  type LucideIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  WebhookIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/** A single settings section route. */
interface SettingsSection {
  /** Absolute route under /settings. */
  href: string;
  /** Display label. */
  label: string;
  /** One-line description shown under the label on wide screens. */
  description: string;
  /** Lucide icon for the row. */
  icon: LucideIcon;
}

/**
 * The canonical settings section list. Order here is the order rendered in the
 * sub-nav and should match the page files under `src/frontend/pages/settings/`.
 */
export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  {
    href: "/settings/preferences",
    label: "Preferences",
    description: "Appearance, language & accessibility",
    icon: SlidersHorizontalIcon,
  },
  {
    href: "/settings/notifications",
    label: "Notifications",
    description: "Channel × category delivery matrix",
    icon: BellIcon,
  },
  {
    href: "/settings/webhooks",
    label: "Webhooks",
    description: "Outbound event subscriptions",
    icon: WebhookIcon,
  },
  {
    href: "/settings/activity",
    label: "Activity",
    description: "Audit trail of recent actions",
    icon: ActivityIcon,
  },
  {
    href: "/settings/advanced",
    label: "Advanced",
    description: "System info & danger zone",
    icon: SettingsIcon,
  },
] as const;

interface SettingsNavProps {
  /**
   * The currently active route, e.g. "/settings/preferences". Passed from the
   * Astro page (which knows it statically) so the island doesn't need to read
   * `window.location` before hydration.
   */
  active: string;
}

/**
 * Left/top settings sub-navigation. Rendered as an island so the active styling
 * stays consistent with the rest of the hydrated settings UI, but it carries no
 * internal state — `active` is supplied by the host page.
 */
export function SettingsNav({ active }: SettingsNavProps) {
  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        // Mobile: horizontal scroller. Desktop: vertical stack.
        "flex gap-1 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0",
      )}
    >
      {SETTINGS_SECTIONS.map((section) => {
        const isActive = active === section.href;
        const Icon = section.icon;
        return (
          <a
            key={section.href}
            href={section.href}
            aria-current={isActive ? "page" : undefined}
            data-active={isActive}
            className={cn(
              "group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
              "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              "data-[active=true]:bg-muted data-[active=true]:text-foreground data-[active=true]:ring-1 data-[active=true]:ring-border/40",
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="font-medium">{section.label}</span>
              <span className="hidden text-xs text-muted-foreground md:block">
                {section.description}
              </span>
            </span>
          </a>
        );
      })}
    </nav>
  );
}
