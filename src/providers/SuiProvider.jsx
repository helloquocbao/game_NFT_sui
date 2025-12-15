import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { SUI_NETWORK, SUI_RPC } from "../config/sui";

const { networkConfig } = createNetworkConfig({
  [SUI_NETWORK]: { url: SUI_RPC },
});

const queryClient = new QueryClient();

export function SuiProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork={SUI_NETWORK}
      >
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}

