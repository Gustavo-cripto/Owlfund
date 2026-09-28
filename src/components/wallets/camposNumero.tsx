// Campos de numero das listas da pagina de carteiras (moneyField/qtyField).
// Movidos de src/app/(pt)/wallets/page.tsx sem alteracoes (fase 2): continuam a
// ser FUNCOES de render chamadas pela pagina, nao componentes — o <input> e a
// sua `key` ficam exatamente iguais, para que os inputs remontem quando antes
// remontavam. A pagina cria-os em cada render com o contexto de moeda atual.
import { cleanDecimalInput, parseDecimal } from "@/lib/format/decimal";
import type { MoneyFieldFn, QtyFieldFn } from "@/lib/wallets/tipos";

/** O que os campos leem de useCurrencyFormat() na pagina. */
type ContextoCampos = { curRate: number; curCode: string; hideBalances: boolean; numberFormat: string };

// Campos de dinheiro nas listas (investido, valor de compra): guardados em EUR,
// mas a pessoa escreve e ve na moeda que escolheu (etiqueta com o simbolo).
// Texto + inputMode="decimal" para aceitar virgula no iPhone. Sem `value`
// controlado: o que se escreve nao e reescrito a meio; `key` re-sincroniza
// quando a moeda ou o valor guardado mudam por fora.
// Nao e um componente (e uma funcao de render chamada pela pagina): a regra
// react/display-name confunde-a com um.
// eslint-disable-next-line react/display-name
export const criarMoneyField = ({ curRate, curCode, hideBalances, numberFormat }: ContextoCampos): MoneyFieldFn => (opts) => {
  const shown = opts.eur != null && Number.isFinite(opts.eur) ? Math.round(opts.eur * (curRate || 1) * 100) / 100 : undefined;
  return (
    <input
      key={`${curCode}:${shown ?? ""}`}
      type={hideBalances ? "password" : "text"}
      inputMode="decimal"
      autoComplete="off"
      placeholder={opts.placeholder}
      aria-label={opts.ariaLabel}
      defaultValue={shown != null ? shown.toLocaleString(numberFormat, { maximumFractionDigits: 2, useGrouping: false }) : ""}
      onBlur={(event) => {
        const text = cleanDecimalInput(event.target.value);
        if (text === "") { opts.onEur(undefined); return; }
        const v = parseDecimal(text);
        if (Number.isFinite(v) && v >= 0) opts.onEur(v / (curRate || 1));
      }}
      className={`${opts.width} rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400`}
    />
  );
};
// Quantidades (moedas/acoes): so o numero, aceita virgula.
// eslint-disable-next-line react/display-name
export const criarQtyField = ({ hideBalances }: Pick<ContextoCampos, "hideBalances">): QtyFieldFn => (opts) => (
  <input
    key={`q:${opts.value ?? ""}`}
    type={hideBalances ? "password" : "text"}
    inputMode="decimal"
    autoComplete="off"
    placeholder={opts.placeholder}
    title={opts.title}
    aria-label={opts.ariaLabel}
    defaultValue={opts.value != null ? String(opts.value) : ""}
    onBlur={(event) => {
      const text = cleanDecimalInput(event.target.value);
      if (text === "") { opts.onValue(undefined); return; }
      const v = parseDecimal(text);
      if (Number.isFinite(v) && v >= 0) opts.onValue(v);
    }}
    className={`${opts.width} rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400`}
  />
);
