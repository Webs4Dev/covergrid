"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { entities, navigation } from "@/lib/entities";

export function Nav() {
  const path = usePathname();
  const link = (href: string, label: string) => (
    <Link
      key={href}
      href={href}
      aria-current={path === href ? "page" : undefined}
      className="block rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-white/80 hover:bg-white/10 hover:text-white aria-[current=page]:bg-accent aria-[current=page]:text-white"
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Main" className="flex gap-1 overflow-x-auto p-2 md:block md:overflow-visible md:p-3">
      {link("/", "Overview")}
      {link("/roster", "Roster")}
      {navigation.map((group) => (
        <div key={group.heading} className="contents md:mt-4 md:block">
          <p className="mb-1 hidden px-2.5 text-xs font-semibold text-white/50 md:block">{group.heading}</p>
          {group.items.map((item) => link(`/manage/${item}`, entities[item].title))}
        </div>
      ))}
    </nav>
  );
}
