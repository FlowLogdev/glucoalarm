import { LogoutButton } from "./logout-button";
import { Logo } from "../lib/Logo";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <a className="brand" href="/dashboard" style={{ display: "inline-flex" }}>
          <Logo size={24} />
        </a>
        <a href="/dashboard">Dashboard</a>
        <a href="/log">Log</a>
        <a href="/reports">Reports</a>
        <a href="/settings">Settings</a>
        <a href="/billing">Billing</a>
        <a href="/support">Support</a>
        <LogoutButton />
      </nav>
      <main>{children}</main>
    </>
  );
}
