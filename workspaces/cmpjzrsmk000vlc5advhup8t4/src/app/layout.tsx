import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "aion-cmpjzrsm",
  description: "Built by AION",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
