export type NavItem = {
  href: string;
  label: string;
  external?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export type SiteConfig = {
  name: string;
  description: string;
  url: string;
  author: {
    name: string;
    url: string;
  };
  links: {
    github: string;
  };
  /** Primary top-level links shown directly in the navbar. */
  navItems: NavItem[];
  /** Grouped destinations rendered as dropdown menus (desktop) / sections (mobile). */
  navGroups: NavGroup[];
};

export const siteConfig: SiteConfig = {
  name: "Cloudflare Edge Showcase",
  description:
    "Multi-page edge frontend showcase using Astro, React, Shadcn UI, and assistant-ui with Cloudflare Agents SDK",
  url: "https://example.com",
  author: {
    name: "Author",
    url: "https://example.com",
  },
  links: {
    github: "https://github.com",
  },
  navItems: [
    { href: "/", label: "Overview" },
    { href: "/dashboard", label: "Dashboard" },
  ],
  navGroups: [
    {
      label: "Workspace",
      items: [
        { href: "/projects", label: "Projects" },
        { href: "/tasks/board", label: "Task Board" },
        { href: "/tasks", label: "Tasks" },
        { href: "/notes", label: "Notes" },
        { href: "/analytics", label: "Analytics" },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/settings", label: "Settings" },
        { href: "/docs", label: "Documentation" },
        { href: "/openapi.json", label: "OpenAPI" },
        { href: "/swagger", label: "Swagger" },
        { href: "/scalar", label: "Scalar" },
      ],
    },
  ],
};
