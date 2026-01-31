type WalletCardProps = {
  title: string;
  description: string;
  address?: string;
  addressDisplay?: string;
  balance?: string | number | null;
  balanceUnit?: string;
  isLoading?: boolean;
  error?: string | null;
  isConnected: boolean;
  isAvailable: boolean;
  onConnect: () => void;
  onRefresh?: () => void;
  children?: React.ReactNode;
  allowConnectWhenUnavailable?: boolean;
  onToggleAddress?: () => void;
  isAddressVisible?: boolean;
};

const formatAddress = (address?: string) => {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export default function WalletCard({
  title,
  description,
  address,
  addressDisplay,
  balance,
  balanceUnit,
  isLoading,
  error,
  isConnected,
  isAvailable,
  onConnect,
  onRefresh,
  children,
  allowConnectWhenUnavailable,
  onToggleAddress,
  isAddressVisible,
}: WalletCardProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            isAvailable ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
          }`}
        >
          {isAvailable ? "Disponível" : "Não instalado"}
        </span>
      </div>

      <div className="mt-5 space-y-3 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-slate-500">Endereço:</span>{" "}
            {address
              ? addressDisplay ?? formatAddress(address)
              : "—"}
          </div>
          {address && onToggleAddress ? (
            <button
              type="button"
              onClick={onToggleAddress}
              className="rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              title={isAddressVisible ? "Ocultar endereço" : "Mostrar endereço"}
              aria-label={isAddressVisible ? "Ocultar endereço" : "Mostrar endereço"}
            >
              {isAddressVisible ? "🙈" : "👁️"}
            </button>
          ) : null}
        </div>
        <div>
          <span className="text-slate-500">Saldo:</span>{" "}
          {balance !== undefined && balance !== null
            ? `${balance} ${balanceUnit ?? ""}`.trim()
            : "—"}
        </div>
        {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={onConnect}
          disabled={isLoading || (!isAvailable && !allowConnectWhenUnavailable)}
        >
          {isConnected ? "Reconectar" : "Conectar"}
        </button>
        {onRefresh ? (
          <button
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onRefresh}
            disabled={!isConnected || isLoading}
          >
            Atualizar saldo
          </button>
        ) : null}
        {isLoading ? <span className="text-xs text-slate-500">Carregando...</span> : null}
      </div>
      {children ? <div className="mt-5 space-y-4">{children}</div> : null}
    </div>
  );
}
