"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "./I18nProvider";
import type { MessageKey } from "@/lib/i18n";

const ITEMS: { href: string; key: MessageKey; icon: string }[] = [
  { href: "/", key: "nav.home", icon: "M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/classes", key: "nav.classes", icon: "M4 5h16v4H4zM4 11h16v8H4z" },
  { href: "/submissions", key: "nav.submissions", icon: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7" },
  { href: "/settings", key: "nav.settings", icon: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" },
];

export function Nav() {
  const pathname = usePathname();
  const { t } = useT();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      <header className="sticky top-0 z-30 hidden border-b border-stone-200 bg-paper/90 backdrop-blur md:block">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <Link href="/" className="text-xl font-bold tracking-wide">
            字<span className="text-accent">清</span>
          </Link>
          <nav className="flex gap-1">
            {ITEMS.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                className={`rounded-lg px-3 py-1.5 text-sm ${active(it.href) ? "bg-stone-200 font-medium" : "text-stone-600 hover:bg-stone-100"}`}
              >
                {t(it.key)}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <div className="grid grid-cols-4">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active(it.href) ? "text-accent" : "text-stone-500"}`}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round">
                <path d={it.icon} />
              </svg>
              {t(it.key)}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
