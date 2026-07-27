/**
 * @fileoverview Desktop primary navigation.
 *
 * Renders the top-level `navItems` as direct links, then each `navGroup` as a
 * dropdown menu (Workspace / Agents / System). Keeps the navbar compact as the
 * template grows more pages over time.
 */

import { ChevronDownIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfig } from "@/lib/config";
import { cn } from "@/lib/utils";

export function MainNav({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      aria-label="Main navigation"
      className={cn("flex items-center gap-1", className)}
      {...props}
    >
      {siteConfig.navItems.map((item) => (
        <a
          key={item.href}
          href={item.href}
          {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          {item.label}
        </a>
      ))}

      {siteConfig.navGroups.map((group) => (
        <DropdownMenu key={group.label}>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1">
                {group.label}
                <ChevronDownIcon className="size-3.5 opacity-60" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" className="min-w-44">
            {group.items.map((item) => (
              <DropdownMenuItem
                key={item.href}
                render={
                  <a
                    href={item.href}
                    {...(item.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {item.label}
                  </a>
                }
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </nav>
  );
}
