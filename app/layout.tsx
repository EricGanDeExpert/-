import type { Metadata, Viewport } from "next";
import "./globals.css";
import { I18nProvider } from "@/components/I18nProvider";
import { Nav } from "@/components/Nav";
import { getT } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "字清 Ziqing",
  description: "Read students' Chinese handwriting from a photo.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafaf9",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages } = await getT();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang={locale}>
      <body className="min-h-dvh antialiased">
        <I18nProvider locale={locale} messages={messages}>
          {user && <Nav />}
          <main className={`mx-auto w-full max-w-5xl px-4 pt-4 ${user ? "pb-24 md:pb-10" : "pb-10"}`}>{children}</main>
        </I18nProvider>
      </body>
    </html>
  );
}
