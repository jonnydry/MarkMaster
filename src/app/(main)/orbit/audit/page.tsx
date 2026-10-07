import type { Metadata } from "next";

import OrbitAuditClient from "./orbit-audit-client";

export const metadata: Metadata = { title: "Tag audit" };

export default function OrbitAuditPage() {
  return <OrbitAuditClient />;
}
