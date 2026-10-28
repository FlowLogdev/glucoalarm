"use client";

import { useEffect, useState } from "react";
import { getCurrentAdmin } from "../lib/api";

/** Only super-admins see the logs console link. */
export function AdminNavLink() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    getCurrentAdmin()
      .then((a) => setShow(a.is_super_admin))
      .catch(() => setShow(false));
  }, []);
  return show ? <a href="/admin">Logs</a> : null;
}
