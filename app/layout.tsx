import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "AlokickFlow - Premium Media Supply Chain",
  description: "Automated media supply chain SaaS for post-production agencies",
  keywords: "media, QC, quality control, post-production, video, audio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
