import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-display", display: "swap" });

const DESCRIPTION =
  "Glucose alerts that reach you before it's urgent. Connect your own Dexcom Share account and get WhatsApp alerts the moment glucose leaves the safe range, plus phone call escalation for lows.";

export const metadata: Metadata = {
  metadataBase: new URL("https://glucoalarm.com"),
  title: {
    default: "Glucoalarm -- Glucose Monitoring Alerts via WhatsApp",
    template: "%s | Glucoalarm",
  },
  description: DESCRIPTION,
  keywords: [
    "glucose monitor alerts",
    "Dexcom WhatsApp alerts",
    "CGM alerts",
    "diabetes glucose monitoring",
    "low glucose phone call alert",
    "continuous glucose monitor notifications",
  ],
  openGraph: {
    type: "website",
    url: "https://glucoalarm.com",
    siteName: "Glucoalarm",
    title: "Glucoalarm -- Glucose Monitoring Alerts via WhatsApp",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Glucoalarm -- Glucose Monitoring Alerts via WhatsApp",
    description: DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body>{children}</body>
    </html>
  );
}
