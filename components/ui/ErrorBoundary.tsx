"use client";

import { Component, type ReactNode } from "react";

interface Props  { children: ReactNode; fallback?: ReactNode; }
interface State  { hasError: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: unknown) {
    console.error("[ErrorBoundary] caught:", err);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div style={{
          minHeight: "100vh", background: "var(--background)",
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: "1rem", padding: "2rem", textAlign: "center",
        }}>
          <div style={{ fontSize: "2.5rem" }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Something went wrong</div>
          <div style={{ fontSize: "0.85rem", color: "var(--muted-foreground)" }}>
            Please reload the page. If the problem persists, log out and back in.
          </div>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            style={{
              padding: "11px 28px", background: "var(--gradient-accent)", color: "#fff",
              border: "none", borderRadius: 10, cursor: "pointer",
              fontWeight: 700, fontFamily: "inherit", fontSize: "0.9rem",
              boxShadow: "var(--shadow-orange)",
            }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
