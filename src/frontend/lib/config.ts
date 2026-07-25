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
        { href: "/inbox", label: "Inbox" },
        { href: "/analytics", label: "Analytics" },
      ],
    },
    {
      label: "Agents",
      items: [
        { href: "/chat", label: "Chat" },
        { href: "/assistant", label: "Assistant" },
        { href: "/showcase/code-mode", label: "Code Mode" },
        { href: "/showcase/browser-hitl", label: "Browser HITL" },
        { href: "/showcase/multi-agent", label: "Multi-Agent" },
        { href: "/showcase/workflows", label: "Workflows" },
        { href: "/showcase/artifacts", label: "Artifacts" },
        { href: "/showcase/mcp", label: "MCP Tools" },
        { href: "/showcase/thinking", label: "Thinking" },
        { href: "/showcase/skills", label: "Skills" },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/notifications", label: "Notifications" },
        { href: "/settings", label: "Settings" },
        { href: "/showcase/features", label: "Platform Features" },
        { href: "/showcase/utilities", label: "Data Utilities" },
        { href: "/docs", label: "Documentation" },
        { href: "/playbook", label: "Playbook" },
        { href: "/openapi.json", label: "OpenAPI" },
        { href: "/swagger", label: "Swagger" },
        { href: "/scalar", label: "Scalar" },
      ],
    },
  ],
};
