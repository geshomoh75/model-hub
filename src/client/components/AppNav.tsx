import { Link } from "@tanstack/react-router";

const LINKS = [
  { to: "/", label: "Models", exact: true },
  { to: "/chat", label: "Chat", exact: false },
  { to: "/activity", label: "Activity", exact: false },
  { to: "/api-access", label: "API", exact: false },
] as const;

/** The app's pages, in the AppShell's bar. */
export function AppNav() {
  return (
    <nav className="flex min-w-0 items-center gap-3 overflow-x-auto text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          activeOptions={{ exact: link.exact }}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          activeProps={{ className: "text-foreground font-medium" }}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
