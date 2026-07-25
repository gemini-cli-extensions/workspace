import { HomeIcon } from "lucide-react";
import * as React from "react";

import { MainNav } from "@/components/MainNav";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full bg-background">
      <div className="container-wrapper px-6 3xl:fixed:px-0">
        <div className="flex h-(--header-height) items-center **:data-[slot=separator]:h-4! 3xl:fixed:container">
          <MobileNav className="flex lg:hidden" />

          <a
            href="/"
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon" }),
              "hidden size-8 lg:flex",
            )}
          >
            <HomeIcon className="size-5" />
            <span className="sr-only">Home</span>
          </a>

          <MainNav className="hidden lg:flex" />

          <div className="ml-auto flex items-center gap-2 md:flex-1 md:justify-end">
            {/* AI AGENT: Add your custom header actions here */}

            <Separator orientation="vertical" className="my-auto" />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}
