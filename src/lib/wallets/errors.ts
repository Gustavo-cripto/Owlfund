// Erros das libs de carteiras com um codigo estavel, para a pagina os poder
// traduzir (as libs nao tem acesso ao t()). A mensagem em portugues fica como
// reserva para quem chamar sem mapa.
//
//   throw walletError("provider_missing", "MetaMask", "MetaMask não está disponível.");
//   … na pagina: userError(err, t("wl_err_connect"), { codes: walletCodes })

export type WalletErrorCode = "provider_missing" | "no_account" | "not_found" | "not_configured";

export type WalletError = Error & { code: WalletErrorCode; provider: string };

export function walletError(code: WalletErrorCode, provider: string, message: string): WalletError {
  return Object.assign(new Error(message), { code, provider });
}
