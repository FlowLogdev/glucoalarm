import { LogoutButton } from "./logout-button";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="nav">
        <a className="brand" href="/dashboard">
          WatchGluco
        </a>
        <a href="/dashboard">Dashboard</a>
        <a href="/log">Log</a>
        <a href="/reports">Reports</a>
        <a href="/settings">Settings</a>
        <LogoutButton />
      </nav>
      <main>{children}</main>
    </>
  );
}
