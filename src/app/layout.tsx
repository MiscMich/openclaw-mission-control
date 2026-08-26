import type { Metadata, Viewport } from "next";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import { ShortcutsProvider } from "@/contexts/ShortcutsContext";
import { GlobalShortcuts } from "@/components/GlobalShortcuts";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenClaw Mission Control",
  description: "Local-first workflow operations for OpenClaw agents",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
    { media: "(prefers-color-scheme: light)", color: "#141414" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      style={{ colorScheme: "dark" }}
    >
      <body
        className="antialiased"
        style={{
          fontFamily: "var(--font-body)",
          background: "var(--bg-void)",
          color: "var(--text-primary)",
        }}
      >
        {/* Skip to main content link for accessibility */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:bg-[var(--accent-primary)] focus:text-white focus:rounded-lg focus:outline-none"
        >
          Skip to main content
        </a>
        <ErrorBoundary>
          <ConvexClientProvider>
            <ShortcutsProvider>
              {children}
              <GlobalShortcuts />
              <Toaster position="bottom-right" />
            </ShortcutsProvider>
          </ConvexClientProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
