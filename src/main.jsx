import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createNetworkConfig,
  SuiClientProvider,
  WalletProvider,
} from "@mysten/dapp-kit";
import { getFullnodeUrl } from "@mysten/sui/client";
import "./index.css";
import App from "./App.jsx";
import { DEFAULT_NETWORK } from "./sui/config";
import "@mysten/dapp-kit/dist/index.css";

const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: getFullnodeUrl("testnet") },
  devnet: { url: getFullnodeUrl("devnet") },
  mainnet: { url: getFullnodeUrl("mainnet") },
  localnet: { url: getFullnodeUrl("localnet") },
});
const defaultNetwork = Object.prototype.hasOwnProperty.call(
  networkConfig,
  DEFAULT_NETWORK
)
  ? DEFAULT_NETWORK
  : "testnet";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networkConfig}
        defaultNetwork={defaultNetwork}
      >
        <WalletProvider autoConnect>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>
);
