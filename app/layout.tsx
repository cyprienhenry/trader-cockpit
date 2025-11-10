import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lading Cockpit",
  description: "Single-page cockpit to explore palletized shipments"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-emerald-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
