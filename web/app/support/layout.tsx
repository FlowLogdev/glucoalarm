import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Support",
  description: "Get help with Glucoalarm setup, alerts, billing, or your Dexcom connection.",
};

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
