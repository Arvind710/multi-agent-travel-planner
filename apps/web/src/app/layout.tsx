import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Inter, JetBrains_Mono, Noto_Sans_Devanagari } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-google-fraunces" });
const inter = Inter({ subsets: ["latin"], variable: "--font-google-inter" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-google-jetbrains" });
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "600"],
  variable: "--font-google-devanagari",
});

export const metadata: Metadata = {
  title: { default: "Raah", template: "%s · Raah" },
  description: "AI-planned, deeply reasoned travel itineraries for India.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#171412" },
  ],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={`${fraunces.variable} ${inter.variable} ${jetbrains.variable} ${devanagari.variable}`}
    >
      <body className="min-h-screen bg-[var(--color-background)] flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <header className="border-b bg-white">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
              <a
                href="/"
                className="text-xl font-bold font-[family-name:var(--font-google-fraunces)] text-[var(--color-primary)]"
              >
                Raah
              </a>
              <nav className="flex gap-4 text-sm font-medium">
                <a href="/plan/new" className="hover:text-[var(--color-primary)]">
                  Plan a Trip
                </a>
                <a href="/trips" className="hover:text-[var(--color-primary)]">
                  My Trips
                </a>
                <a href="/profile" className="hover:text-[var(--color-primary)]">
                  Personas
                </a>
              </nav>
            </div>
          </header>
          <main className="flex-1">{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
