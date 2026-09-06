"use client";

// Renderizador de markdown para os chats (Chain e Gestor "Block").
// Suporta cabeçalhos, **negrito**, *itálico*, `código`, listas (-, •, 1.),
// TABELAS markdown (| a | b |) e blocos ``` com botão de copiar — um bloco
// ```csv ganha também um botão para transferir o ficheiro. Tudo construído em
// nós React (sem innerHTML), por isso o texto vem sempre escapado.

import { Fragment, useState, type ReactNode } from "react";

export type ChatMarkdownLabels = { copy: string; copied: string; downloadCsv: string };
const DEFAULT_LABELS: ChatMarkdownLabels = { copy: "Copiar", copied: "Copiado ✓", downloadCsv: "Transferir .csv" };

// ── Inline: `código`, **negrito**, *itálico* ─────────────────────────────────
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(`[^`\n]+`)/g).forEach((seg, i) => {
    if (/^`[^`\n]+`$/.test(seg)) {
      out.push(<code key={`${key}c${i}`} className="rounded bg-slate-800/80 px-1 py-0.5 font-mono text-[0.85em] text-orange-300">{seg.slice(1, -1)}</code>);
      return;
    }
    seg.split(/(\*\*[^*\n]+\*\*)/g).forEach((b, j) => {
      if (/^\*\*[^*\n]+\*\*$/.test(b)) {
        out.push(<strong key={`${key}b${i}-${j}`} className="font-semibold text-white">{b.slice(2, -2)}</strong>);
        return;
      }
      b.split(/(\*[^*\n]+\*)/g).forEach((s, k) => {
        if (/^\*[^*\n]+\*$/.test(s)) out.push(<em key={`${key}i${i}-${j}-${k}`}>{s.slice(1, -1)}</em>);
        else if (s) out.push(<Fragment key={`${key}t${i}-${j}-${k}`}>{s}</Fragment>);
      });
    });
  });
  return out;
}

// ── Bloco de código (copiar + transferir CSV) ────────────────────────────────
function CodeBlock({ code, lang, labels }: { code: string; lang: string; labels: ChatMarkdownLabels }) {
  const [copied, setCopied] = useState(false);
  const looksCsv = lang === "csv" || (!lang && /^[^,\n]{1,60}(,[^,\n]{0,60}){1,}\n/.test(code));

  const copy = () => {
    try { void navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); } catch { /* ignore */ }
  };
  const downloadCsv = () => {
    try {
      const blob = new Blob(["﻿" + code], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chainfolioai-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* ignore */ }
  };

  return (
    <div className="relative my-2 overflow-hidden rounded-xl border border-slate-700/70 bg-slate-950/80">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">{lang || "text"}</span>
        <span className="flex gap-1.5">
          {looksCsv && (
            <button type="button" onClick={downloadCsv}
              className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20">
              ⬇ {labels.downloadCsv}
            </button>
          )}
          <button type="button" onClick={copy}
            className="rounded-md border border-slate-700 px-2 py-0.5 text-[10px] text-slate-400 hover:text-white">
            {copied ? labels.copied : labels.copy}
          </button>
        </span>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11px] leading-relaxed text-slate-300">{code}</pre>
    </div>
  );
}

// ── Tabela markdown ──────────────────────────────────────────────────────────
const splitRow = (line: string): string[] =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSeparatorRow = (line: string): boolean =>
  /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);

function Table({ rows, keyPrefix }: { rows: string[]; keyPrefix: string }) {
  let header: string[] | null = null;
  let body = rows;
  if (rows.length >= 2 && isSeparatorRow(rows[1])) {
    header = splitRow(rows[0]);
    body = rows.slice(2);
  }
  const bodyCells = body.filter((r) => !isSeparatorRow(r)).map(splitRow);
  return (
    <div className="my-2 overflow-x-auto rounded-xl border border-slate-700/70">
      <table className="w-full border-collapse text-xs">
        {header && (
          <thead>
            <tr className="bg-slate-800/70">
              {header.map((h, i) => (
                <th key={`${keyPrefix}h${i}`} className="whitespace-nowrap px-3 py-2 text-left font-semibold text-slate-200">{inline(h, `${keyPrefix}h${i}`)}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-800/60">
          {bodyCells.map((cells, r) => (
            <tr key={`${keyPrefix}r${r}`} className={r % 2 ? "bg-slate-900/40" : ""}>
              {cells.map((c, i) => (
                <td key={`${keyPrefix}r${r}c${i}`} className="px-3 py-1.5 align-top text-slate-300">{inline(c, `${keyPrefix}r${r}c${i}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function ChatMarkdown({ content, labels = DEFAULT_LABELS }: { content: string; labels?: ChatMarkdownLabels }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const key = `b${blockIdx++}`;

    // Bloco de código ```
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { codeLines.push(lines[i]); i++; }
      i++; // fecha ```
      blocks.push(<CodeBlock key={key} code={codeLines.join("\n")} lang={fence[1] ?? ""} labels={labels} />);
      continue;
    }

    // Tabela: linhas consecutivas com ≥2 pipes
    const pipeCount = (line.match(/\|/g) ?? []).length;
    if (pipeCount >= 2 && line.trim().startsWith("|")) {
      const rows: string[] = [];
      while (i < lines.length && (lines[i].match(/\|/g) ?? []).length >= 2 && lines[i].trim().startsWith("|")) { rows.push(lines[i]); i++; }
      if (rows.length >= 2) { blocks.push(<Table key={key} rows={rows} keyPrefix={key} />); continue; }
      // linha solta com pipes → parágrafo normal
      blocks.push(<p key={key} className="my-1">{inline(rows[0], key)}</p>);
      continue;
    }

    // Cabeçalhos
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? "mt-3 mb-1 text-[15px] font-bold text-white" : level === 2 ? "mt-3 mb-1 text-sm font-bold text-white" : "mt-2 mb-0.5 text-[13px] font-semibold text-slate-100";
      blocks.push(<p key={key} className={cls}>{inline(h[2], key)}</p>);
      i++;
      continue;
    }

    // Listas (agrupa itens consecutivos)
    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*•]\s+/, "")); i++; }
      blocks.push(
        <ul key={key} className="my-1.5 list-disc space-y-1 pl-5 marker:text-orange-400">
          {items.map((it, j) => <li key={`${key}l${j}`}>{inline(it, `${key}l${j}`)}</li>)}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push(
        <ol key={key} className="my-1.5 list-decimal space-y-1 pl-5 marker:text-orange-400">
          {items.map((it, j) => <li key={`${key}o${j}`}>{inline(it, `${key}o${j}`)}</li>)}
        </ol>,
      );
      continue;
    }

    // Linha em branco → espaçamento
    if (!line.trim()) { blocks.push(<div key={key} className="h-1.5" />); i++; continue; }

    // Parágrafo
    blocks.push(<p key={key} className="my-0.5">{inline(line, key)}</p>);
    i++;
  }

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}
