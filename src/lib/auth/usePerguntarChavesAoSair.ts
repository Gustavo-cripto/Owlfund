"use client";

import { useConfirm } from "@/components/ConfirmDialog";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { esquecerChavesExchangeLocais, temChavesExchangeLocais } from "@/lib/portfolios/accounts";

/**
 * Ao sair, quem tem chaves de exchange só neste browser escolhe se ficam. Não se
 * apagam em silêncio: não há cópia em lado nenhum, e num computador pessoal
 * obrigava a colá-las de cada vez. Quem entra a seguir com outra conta limpa-as
 * de qualquer maneira (claimLocalData).
 */
export function usePerguntarChavesAoSair(): () => Promise<void> {
  const askConfirm = useConfirm();
  const { t } = useLanguage();
  return async () => {
    if (!temChavesExchangeLocais()) return;
    const apagar = await askConfirm({
      title: t("sair_chaves_titulo"),
      message: t("sair_chaves_msg"),
      okLabel: t("sair_chaves_apagar"),
      cancelLabel: t("sair_chaves_manter"),
      danger: true,
    });
    if (apagar) esquecerChavesExchangeLocais();
  };
}
