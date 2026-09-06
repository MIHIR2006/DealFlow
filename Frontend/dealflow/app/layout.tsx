import type { Metadata, Viewport } from "next";
import { Newsreader } from "next/font/google";
import { cn } from "@/lib/utils";
import "@fontsource-variable/stack-sans-text";
import "@fontsource-variable/stack-sans-headline";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-newsreader",
  display: "swap",
  axes: ["opsz"],
});

// Stated rather than inherited: the whole workspace is laid out against the
// device width, and a zoom lock would trap anyone who needs to magnify.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "DealFlow360 — The self-governing deal engine",
  description:
    "Discount routing, warehouse splits, hybrid billing, and customer negotiation — resolved by the system itself, before a manager ever opens the deal.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("h-full antialiased", newsreader.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
