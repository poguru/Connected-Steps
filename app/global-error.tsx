"use client";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
        }}
      >
        <div
          style={{
            maxWidth: "420px",
            width: "100%",
            textAlign: "center",
            padding: "2.5rem 2rem",
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "16px",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>⚠️</div>
          <h2
            style={{
              fontSize: "1.25rem",
              fontWeight: 700,
              color: "#fff",
              marginBottom: "0.5rem",
            }}
          >
            Something went wrong
          </h2>
          <p
            style={{
              fontSize: "0.875rem",
              color: "rgba(255,255,255,0.5)",
              marginBottom: "1.5rem",
              lineHeight: 1.6,
            }}
          >
            A temporary error occurred. Tap retry to try again.
            {error.digest && (
              <span
                style={{
                  display: "block",
                  marginTop: "0.5rem",
                  fontSize: "0.75rem",
                  fontFamily: "monospace",
                  color: "rgba(255,255,255,0.25)",
                }}
              >
                ID: {error.digest}
              </span>
            )}
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              padding: "10px 28px",
              background: "#e8620a",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: "0.75rem",
              width: "100%",
            }}
          >
            Retry
          </button>
          <button
            onClick={() => (window.location.href = "/")}
            style={{
              padding: "10px 28px",
              background: "transparent",
              color: "rgba(255,255,255,0.45)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              width: "100%",
            }}
          >
            Go home
          </button>
        </div>
      </body>
    </html>
  );
}
