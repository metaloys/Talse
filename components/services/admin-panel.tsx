"use client";

// The admin console. The implementation now lives in ./admin/* — a shell with a
// grouped, role-aware sidebar and one screen per section (Overview, Operations,
// Catalogue, People, Business, Governance). This file keeps the original export
// name so `services-app.tsx` continues to lazy-load it unchanged.
export { AdminConsole as AdminPanel } from "./admin/console";
