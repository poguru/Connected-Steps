import React from "react";
import { color, radius, font } from "./tokens";

interface Column<T> {
  key:      string;
  header:   string;
  width?:   string;
  align?:   "left" | "center" | "right";
  render?:  (row: T, index: number) => React.ReactNode;
}

interface TableProps<T> {
  columns:     Column<T>[];
  data:        T[];
  keyFn?:      (row: T, index: number) => string;
  emptyLabel?: string;
  stickyHead?: boolean;
  style?:      React.CSSProperties;
}

export function Table<T>({ columns, data, keyFn, emptyLabel = "No data", stickyHead = false, style }: TableProps<T>) {
  const thStyle: React.CSSProperties = {
    padding:       "10px 14px",
    fontSize:      "10px",
    fontWeight:    700,
    letterSpacing: "0.09em",
    textTransform: "uppercase" as const,
    color:         color.textMuted,
    textAlign:     "left",
    background:    stickyHead ? color.dark : "rgba(255,255,255,0.02)",
    borderBottom:  `1px solid ${color.border}`,
    whiteSpace:    "nowrap" as const,
    position:      stickyHead ? "sticky" as const : undefined,
    top:           stickyHead ? 0 : undefined,
    zIndex:        stickyHead ? 1 : undefined,
    fontFamily:    font.body,
  };

  const tdStyle: React.CSSProperties = {
    padding:    "10px 14px",
    fontSize:   "13px",
    color:      color.textSecondary,
    borderBottom: `1px solid rgba(255,255,255,0.04)`,
    fontFamily: font.body,
    verticalAlign: "middle",
  };

  return (
    <div style={{ background: color.dark, border: `1px solid ${color.border}`, borderRadius: radius.lg, overflow: "hidden", ...style }}>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
          <thead>
            <tr>
              {columns.map(col => (
                <th key={col.key} style={{ ...thStyle, width: col.width, textAlign: col.align ?? "left" }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ ...tdStyle, textAlign: "center", padding: "40px", color: color.textMuted }}>
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              data.map((row, ri) => (
                <tr key={keyFn ? keyFn(row, ri) : ri} style={{ background: ri % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                  {columns.map(col => (
                    <td key={col.key} style={{ ...tdStyle, textAlign: col.align ?? "left" }}>
                      {col.render ? col.render(row, ri) : String((row as Record<string, unknown>)[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
