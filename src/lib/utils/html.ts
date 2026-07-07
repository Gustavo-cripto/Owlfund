/**
 * Escapa HTML para prevenir XSS antes de aplicar formatação markdown segura
 * (as tags de formatação — <strong>, <em>, <li>… — são inseridas DEPOIS deste
 * escape, por isso não são afetadas). Usar sempre que texto dinâmico (ex.:
 * respostas de IA) for injetado via dangerouslySetInnerHTML.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
