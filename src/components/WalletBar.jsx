import { ConnectButton, useCurrentAccount, useSuiClientQuery } from "@mysten/dapp-kit";

export function WalletBar() {
  const account = useCurrentAccount();

  const { data: balance } = useSuiClientQuery(
    "getBalance",
    {
      owner: account?.address,
    },
    {
      enabled: !!account,
    },
  );

  return (
    <div className="wallet-connect-btn w-full flex justify-end items-center gap-3 h-14 px-4 mb-6 py-2 pb-3">
      {account && balance && (
        <span className="text-xs font-mono text-slate-600">
          {(Number(balance.totalBalance) / 1e9).toFixed(2)} SUI
        </span>
      )}
      <ConnectButton />
    </div>
  );
}