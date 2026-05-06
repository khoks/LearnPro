import type { Metadata } from "next";
import * as React from "react";
import type { ReactNode } from "react";
import "./globals.css";
import { ServiceWorkerRegistrar } from "../components/pwa/ServiceWorkerRegistrar";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Next.js's automatic JSX runtime handles this in production; vitest does not.
void React;

// STORY-044 — PWA baseline. The manifest + theme-color + apple-touch-icon hints make the app
// installable on Chrome / Edge / Safari. Theme-color matches the manifest's "#0a7" so the system
// chrome (Android status bar, Safari toolbar, installed-window title bar) blends with the brand.
export const metadata: Metadata = {
  title: "LearnPro",
  description: "Adaptive AI-tutored self-hosted learning platform.",
  manifest: "/manifest.webmanifest",
  themeColor: "#0a7",
  icons: {
    icon: [
      { url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
      { url: "/icons/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192.svg", sizes: "192x192", type: "image/svg+xml" }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
