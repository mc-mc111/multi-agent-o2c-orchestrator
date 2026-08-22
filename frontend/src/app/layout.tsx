import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Supervity O2C Command Center | Multi-Agent Orchestrator",
  description: "Operations & Ingestion Command Center for B2B Order-to-Cash Automation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0f19] text-slate-100 antialiased selection:bg-sky-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
