import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Start Your Free Trial",
  description:
    "Start your 7-day free Glucoalarm trial. Connect your own Dexcom Share account and get WhatsApp glucose alerts plus phone-call escalation for lows.",
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
