"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { entities, type EntityName } from "@/lib/entities";

const DAILY = [
  { href: "/", label: "Dashboard", icon: "M3 11l9-8 9 8M5 10v10h14V10" },
  { href: "/roster", label: "Roster", icon: "M4 5h16v15H4zM4 10h16M9 5v15M15 5v15" },
  { href: "/manage/time-off", label: "Time off", icon: "M12 7v5l3 3M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" },
];

const SETUP: { heading: string; items: EntityName[] }[] = [
  { heading: "People", items: ["employees", "pods", "comp-offs"] },
  { heading: "Clients", items: ["brands", "services", "assignments", "processes"] },
  { heading: "Rules", items: ["calendars", "shifts", "staffing-rules", "holidays"] },
];

export function Nav() {
  const path = usePathname();
  const current = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
  // Leave review lives under /roster but belongs to Time off.
  const active = (href: string) =>
    path === "/roster/leave" ? href === "/manage/time-off" : current(href);
  const link = (href: string, label: string, icon?: string) => (
    <Link
      key={href}
      href={href}
      aria-current={active(href) ? "page" : undefined}
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap text-white/80 hover:bg-white/10 hover:text-white aria-[current=page]:bg-accent aria-[current=page]:text-white"
    >
      {icon && (
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d={icon} />
        </svg>
      )}
      {label}
    </Link>
  );

  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto p-2 md:min-h-0 md:flex-1 md:flex-col md:overflow-x-visible md:overflow-y-auto md:p-3">
      {DAILY.map((item) => link(item.href, item.label, item.icon))}
      <p className="mt-4 mb-1 hidden px-2.5 text-xs text-white/50 md:block">Setup</p>
      {SETUP.map((group) => (
        // Open by itself when the current page is inside it.
        <details key={`${group.heading}-${path}`} open={group.items.some((i) => path === `/manage/${i}`)} className="shrink-0">
          <summary className="cursor-pointer rounded-lg px-2.5 py-1.5 text-sm text-white/80 hover:bg-white/10">{group.heading}</summary>
          <div className="mt-1 flex flex-col gap-0.5 md:ml-2">
            {group.items.map((item) => link(`/manage/${item}`, entities[item].title))}
          </div>
        </details>
      ))}
    </nav>
  );
}
