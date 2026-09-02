import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatchGluco",
  description: "Glucose monitoring dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <span className="brand">WatchGluco</span>
          <a href="/">Dashboard</a>
          <a href="/settings">Settings</a>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
