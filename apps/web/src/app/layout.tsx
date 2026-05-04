import type { Metadata } from "next";
import * as React from "react";
import type { ReactNode } from "react";
import "./globals.css";

// Reference React explicitly so vitest's classic-runtime JSX transform doesn't strip the
// import. Next.js's automatic JSX runtime handles this in production; vitest does not.
void React;

export const metadata: Metadata = {
  title: "LearnPro",
  description: "Adaptive AI-tutored self-hosted learning platform.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
