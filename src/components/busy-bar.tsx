"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Pages are read fresh from the database, so a click can take a moment. This shows
// at once that it was received. It is keyed by the address, so arriving clears it.
function Bar() {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const goingTo = (url: URL) => {
      if (url.origin === location.origin && url.pathname + url.search !== location.pathname + location.search) setBusy(true);
    };
    const click = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element).closest("a[href]");
      if (link instanceof HTMLAnchorElement && !link.target && !link.hasAttribute("download")) goingTo(new URL(link.href));
    };
    // Only the "Show" and "Search" forms; saving buttons already say "Saving...".
    const submit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (form.getAttribute("method") && form.method !== "get") return;
      const action = form.getAttribute("action");
      if (!action?.startsWith("/")) return;
      const url = new URL(action, location.origin);
      url.search = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
      goingTo(url);
    };
    document.addEventListener("click", click, true);
    document.addEventListener("submit", submit, true);
    return () => {
      document.removeEventListener("click", click, true);
      document.removeEventListener("submit", submit, true);
    };
  }, []);

  if (!busy) return null;
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center">
      <span className="h-1 w-full animate-pulse bg-accent-bright" />
      <span className="mt-1 rounded-md bg-ink px-3 py-1 text-sm font-semibold text-white">Loading...</span>
    </div>
  );
}

export function BusyBar() {
  const key = `${usePathname()}?${useSearchParams()}`;
  return <Bar key={key} />;
}
