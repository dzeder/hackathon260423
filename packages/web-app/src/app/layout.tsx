import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ohanafy Plan",
  description: "FP&A copilot for beverage wholesalers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
