import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AION — Autonomous Intelligent Orchestration Network",
  description: "Build, test, and ship complete web apps autonomously with 6 AI agents working together.",
  keywords: ["AION", "AI agents", "autonomous development", "multi-agent", "Next.js"],
  authors: [{ name: "AION" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "AION",
    description: "Autonomous Intelligent Orchestration Network",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AION",
    description: "Autonomous Intelligent Orchestration Network",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
