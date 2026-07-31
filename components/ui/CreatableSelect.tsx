"use client";

// Searchable + creatable select component.
// Replaces native <select> for event_type and event_category dropdowns.
// Supports: search, keyboard navigation (↑↓ Enter Esc), inline creation,
// duplicate prevention. No external dependencies.

import {
  useState, useRef, useEffect, useCallback, KeyboardEvent,
} from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface CreatableSelectProps {
  value:           string;
  onChange:        (value: string) => void;
  options:         SelectOption[];
  onCreateOption?: (name: string) => Promise<SelectOption | null>;
  placeholder?:    string;
  /** CSS applied to the outer container — pass your design system's select style here */
  style?:          React.CSSProperties;
  className?:      string;
  /** Inner padding (default "9px 12px"). Create wizard should pass "11px 14px". */
  padding?:        string;
  disabled?:       boolean;
  creating?:       boolean;  // external loading indicator while creating
}

export default function CreatableSelect({
  value,
  onChange,
  options,
  onCreateOption,
  placeholder = "Select or type to search…",
  style,
  className,
  padding = "9px 12px",
  disabled = false,
  creating = false,
}: CreatableSelectProps) {
  const [isOpen,      setIsOpen]      = useState(false);
  const [query,       setQuery]       = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const [localCreating, setLocalCreating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const listRef      = useRef<HTMLUListElement>(null);

  const isCreating = creating || localCreating;

  // Derive the display label for the currently selected value
  const selectedLabel = options.find(o => o.value === value)?.label ?? value ?? "";

  // Filtered options based on search query
  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase().trim()))
    : options;

  // Whether "Create X" option should appear
  const trimmedQuery  = query.trim();
  const isDuplicate   = options.some(o => o.label.toLowerCase() === trimmedQuery.toLowerCase());
  const showCreate    = !!onCreateOption && trimmedQuery.length > 0 && !isDuplicate;

  // Total items in dropdown (filtered options + optional create entry)
  const totalItems = filtered.length + (showCreate ? 1 : 0);

  // Sync display when value or options change while closed
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLLIElement>(`[data-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const open = useCallback(() => {
    if (disabled || isCreating) return;
    setIsOpen(true);
    setQuery("");
    setHighlighted(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [disabled, isCreating]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
  }, []);

  function selectOption(opt: SelectOption) {
    onChange(opt.value);
    close();
  }

  async function handleCreate() {
    if (!onCreateOption || !trimmedQuery || isCreating) return;
    setLocalCreating(true);
    try {
      const created = await onCreateOption(trimmedQuery);
      if (created) {
        onChange(created.value);
        close();
      }
    } finally {
      setLocalCreating(false);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlighted(h => Math.min(h + 1, totalItems - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlighted(h => Math.max(h - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (highlighted < filtered.length) {
          if (filtered[highlighted]) selectOption(filtered[highlighted]);
        } else if (showCreate) {
          handleCreate();
        }
        break;
      case "Escape":
        e.preventDefault();
        close();
        break;
    }
  }

  const containerStyle: React.CSSProperties = {
    width:      "100%",
    background: "rgba(255,255,255,0.05)",
    border:     `1px solid ${isOpen ? "#e8620a" : "rgba(255,255,255,0.1)"}`,
    borderRadius: 8,
    boxShadow:  isOpen ? "0 0 0 3px rgba(232,98,10,0.18)" : undefined,
    boxSizing:  "border-box",
    fontFamily: "inherit",
    transition: "border-color 0.15s, box-shadow 0.15s",
    cursor:     disabled ? "not-allowed" : "pointer",
    opacity:    disabled ? 0.6 : 1,
    ...style,
    position:   "relative",
  };

  const rowStyle: React.CSSProperties = {
    display:    "flex",
    alignItems: "center",
    padding,
    gap:        6,
    minHeight:  "1em",
  };

  const inputStyle: React.CSSProperties = {
    flex:       1,
    background: "transparent",
    border:     "none",
    outline:    "none",
    color:      "#fff",
    fontSize:   "inherit",
    fontFamily: "inherit",
    padding:    0,
    margin:     0,
    cursor:     disabled ? "not-allowed" : "text",
    minWidth:   0,
  };

  const dropdownStyle: React.CSSProperties = {
    position:        "absolute",
    top:             "calc(100% + 4px)",
    left:            0,
    right:           0,
    zIndex:          1000,
    background:      "#1a1a1a",
    border:          "1px solid rgba(255,255,255,0.12)",
    borderRadius:    8,
    boxShadow:       "0 8px 24px rgba(0,0,0,0.5)",
    maxHeight:       240,
    overflowY:       "auto",
    padding:         "4px 0",
  };

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={className}
      onClick={() => { if (!isOpen) open(); }}
      role="combobox"
      aria-expanded={isOpen}
      aria-haspopup="listbox"
    >
      <div style={rowStyle}>
        {isOpen ? (
          <input
            ref={inputRef}
            style={inputStyle}
            value={query}
            onChange={e => { setQuery(e.target.value); setHighlighted(0); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isCreating}
            aria-autocomplete="list"
            aria-controls="creatable-listbox"
          />
        ) : (
          <span style={{ flex: 1, color: selectedLabel ? "#fff" : "rgba(255,255,255,0.4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "inherit" }}>
            {selectedLabel || placeholder}
          </span>
        )}

        {isCreating ? (
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>saving…</span>
        ) : (
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11, flexShrink: 0, transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
            ▾
          </span>
        )}
      </div>

      {isOpen && (
        <ul
          id="creatable-listbox"
          ref={listRef}
          style={dropdownStyle}
          role="listbox"
        >
          {filtered.length === 0 && !showCreate && (
            <li style={{ padding: "10px 14px", color: "rgba(255,255,255,0.35)", fontSize: 13, listStyle: "none" }}>
              No results
            </li>
          )}

          {filtered.map((opt, i) => {
            const isHighlighted = highlighted === i;
            return (
              <li
                key={opt.value}
                data-idx={i}
                role="option"
                aria-selected={opt.value === value}
                onMouseDown={e => { e.preventDefault(); selectOption(opt); }}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  padding:    "9px 14px",
                  cursor:     "pointer",
                  fontSize:   13,
                  color:      opt.value === value ? "#e8620a" : "#fff",
                  background: isHighlighted ? "rgba(255,255,255,0.07)" : "transparent",
                  display:    "flex",
                  alignItems: "center",
                  gap:        8,
                  listStyle:  "none",
                  borderLeft: opt.value === value ? "2px solid #e8620a" : "2px solid transparent",
                }}
              >
                <span style={{ flex: 1 }}>{opt.label}</span>
                {opt.value === value && (
                  <span style={{ color: "#e8620a", fontSize: 12 }}>✓</span>
                )}
              </li>
            );
          })}

          {showCreate && (
            <li
              data-idx={filtered.length}
              role="option"
              aria-selected={false}
              onMouseDown={e => { e.preventDefault(); handleCreate(); }}
              onMouseEnter={() => setHighlighted(filtered.length)}
              style={{
                padding:    "9px 14px",
                cursor:     isCreating ? "wait" : "pointer",
                fontSize:   13,
                color:      "#e8620a",
                background: highlighted === filtered.length ? "rgba(232,98,10,0.08)" : "transparent",
                borderTop:  filtered.length > 0 ? "1px solid rgba(255,255,255,0.06)" : undefined,
                display:    "flex",
                alignItems: "center",
                gap:        8,
                listStyle:  "none",
              }}
            >
              <span style={{ fontSize: 14 }}>＋</span>
              <span>Create <strong>&ldquo;{trimmedQuery}&rdquo;</strong></span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
