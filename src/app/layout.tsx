import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CoverGrid",
  description: "Plan, check and manage monthly team rosters.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plex.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col md:flex-row">
        <aside className="shrink-0 bg-ink text-white md:w-56">
          <p className="flex items-center gap-2 px-4 pt-4 pb-1 text-lg font-semibold">
            {/* A tiny roster: the one cell in the accent colour is a covered day. */}
            <span aria-hidden className="grid grid-cols-2 gap-0.5">
              <span className="size-2 bg-white/40" />
              <span className="size-2 bg-white/40" />
              <span className="size-2 bg-white/40" />
              <span className="size-2 bg-accent" />
            </span>
            CoverGrid
          </p>
          <Nav />
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </body>
    </html>
  );
}
