import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Nav } from "@/components/nav";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CoverGrid",
  description: "Plan, check and manage monthly team rosters.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} antialiased`}>
      {/* On a laptop the app fills the window; long content scrolls inside it. */}
      <body className="flex min-h-dvh flex-col md:h-dvh md:flex-row md:overflow-hidden">
        <aside className="flex shrink-0 flex-col bg-ink text-white md:w-52">
          <p className="flex items-center gap-2 px-4 pt-4 pb-1 text-lg font-bold">
            {/* A tiny roster: the one cell in the accent colour is a covered day. */}
            <span aria-hidden className="grid grid-cols-2 gap-0.5">
              <span className="size-2 rounded-[2px] bg-white/40" />
              <span className="size-2 rounded-[2px] bg-white/40" />
              <span className="size-2 rounded-[2px] bg-white/40" />
              <span className="size-2 rounded-[2px] bg-accent-bright" />
            </span>
            CoverGrid
          </p>
          <Nav />
        </aside>
        <main className="min-h-0 min-w-0 flex-1 md:overflow-y-auto">{children}</main>
      </body>
    </html>
  );
}
