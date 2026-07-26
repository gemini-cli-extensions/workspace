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
  name: "Google Workspace MCP",
  description:
    "A remote MCP server exposing Google Drive, Docs, Sheets, and Gmail tools over a single Cloudflare Worker",
  url: "https://example.com",
  author: {
    name: "Author",
    url: "https://example.com",
  },
  links: {
    github: "https://github.com",
  },
  navItems: [
    { href: "/gws", label: "Overview" },
    { href: "/docs", label: "Docs" },
    { href: "/gws/operations", label: "Operations" },
  ],
  navGroups: [
    {
      label: "Google Workspace",
      items: [
        { href: "/docs/google-config", label: "Google Cloud Config" },
        { href: "/gws/setup", label: "Setup & Deploy" },
        { href: "/gws/tools", label: "MCP Tools" },
        { href: "/gws/operations", label: "Operations Log" },
        { href: "/gws/assets", label: "Asset Activity" },
      ],
    },
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
        { href: "/openapi.json", label: "OpenAPI" },
        { href: "/swagger", label: "Swagger" },
        { href: "/scalar", label: "Scalar" },
      ],
    },
  ],
};
