"use client";

import { useState } from "react";

// Nome de carteira editável inline (✏️). O endereço nunca é mostrado — a carteira
// é identificada por este nome.
export default function EditableName({
  current, display, onSave, placeholder,
}: {
  current: string;
  display: React.ReactNode;
  onSave: (value: string) => void;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(current);
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 align-middle">
        <input
          autoFocus
          value={draft}
          maxLength={64}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-36 rounded border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-xs text-slate-100 outline-none focus:border-orange-400"
        />
        <button type="button" onClick={(e) => { e.stopPropagation(); onSave(draft); setEditing(false); }} className="text-[11px] text-emerald-400 hover:text-emerald-300">✓</button>
        <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(false); }} className="text-[11px] text-slate-500 hover:text-slate-300">✕</button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {display}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDraft(current); setEditing(true); }}
        className="text-[11px] text-slate-500 transition hover:text-orange-400"
        title={placeholder}
        aria-label={placeholder}
      >
        ✏️
      </button>
    </span>
  );
}
