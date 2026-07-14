// Root layout — replaced with themed, font-loaded, next-intl layout in P0.12.
import type { ReactNode } from "react";

export const metadata = { title: "Raah" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
