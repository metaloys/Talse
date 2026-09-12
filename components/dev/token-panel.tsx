"use client";

import React from "react";
import { usePiAuth } from "@/contexts/pi-auth-context";

// Single, well-formed dev-only token panel. Guard at runtime so it never
// renders in production even if imported accidentally.
export default function DevTokenPanel(): React.ReactElement | null {
  if (process.env.NODE_ENV === "production") return null;

  const { accessToken } = usePiAuth();

  const handleCopy = async () => {
    try {
      if (!accessToken) return;
      await navigator.clipboard.writeText(accessToken);
    } catch (e) {
      // ignore copy failures in dev tool
    }
  };

  return (
    <div style={{ position: "fixed", right: 12, bottom: 12, zIndex: 9999 }}>
      <div
        style={{
          width: 360,
          maxWidth: "calc(100vw - 24px)",
          background: "rgba(255,255,255,0.98)",
          border: "1px solid rgba(0,0,0,0.06)",
          padding: 10,
          borderRadius: 8,
          boxShadow: "0 6px 24px rgba(0,0,0,0.08)",
          fontSize: 13,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <strong style={{ fontSize: 12 }}>Dev: Pi Access Token</strong>
          <div style={{ fontSize: 11, color: "#666" }}>(dev only)</div>
        </div>

        <textarea
          readOnly
          value={accessToken ?? ""}
          placeholder="No token yet"
          style={{ width: "100%", height: 64, resize: "vertical", fontSize: 12 }}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={handleCopy} disabled={!accessToken} style={{ padding: "6px 8px", fontSize: 13 }}>
            Copy
          </button>
          <a
            href="/debug-realtime"
            style={{
              padding: "6px 8px",
              fontSize: 13,
              textDecoration: "none",
              background: "#f3f4f6",
              borderRadius: 4,
              display: "inline-block",
              color: "#111",
            }}
            aria-label="Open Realtime Test (dev only)"
            data-testid="realtime-test-link"
          >
            Realtime Test
          </a>
        </div>

        <div style={{ marginTop: 8, fontSize: 11, color: "#666" }}>
          No expiry information available from the Pi SDK (authenticate() returns only accessToken/user).
        </div>
      </div>
    </div>
  );
}
