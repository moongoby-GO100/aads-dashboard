"use client";
import { useState, useRef, useEffect } from "react";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "검색...",
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);
  const filtered = query
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        o.value.toLowerCase().includes(query.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`} style={{ minWidth: 140 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen((o) => !o); setQuery(""); }}
        className="w-full flex items-center justify-between px-3 py-1.5 text-sm rounded-lg"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: disabled ? "var(--text-secondary)" : "var(--text-primary)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          outline: "none",
        }}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg
          width="12" height="12" viewBox="0 0 12 12" fill="none"
          style={{ marginLeft: 6, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            minWidth: 180,
          }}
        >
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색..."
              className="w-full text-sm px-2 py-1 rounded"
              style={{
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>
          <ul style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-center" style={{ color: "var(--text-secondary)" }}>
                결과 없음
              </li>
            ) : (
              filtered.map((opt) => (
                <li
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); setQuery(""); }}
                  className="px-3 py-2 text-sm cursor-pointer"
                  style={{
                    color: opt.value === value ? "var(--accent)" : "var(--text-primary)",
                    background: opt.value === value ? "var(--bg-hover)" : "transparent",
                    fontWeight: opt.value === value ? 600 : 400,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = opt.value === value ? "var(--bg-hover)" : "transparent"; }}
                >
                  {opt.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
