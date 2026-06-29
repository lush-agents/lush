import "./globals.css";
import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: {
    template: "%s | Lush Docs",
    default: "Lush Docs"
  },
  description: "Documentation for Lush, an open control plane for AI applications and agent runtimes.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg"
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
