import { getFullnodeUrl } from "@mysten/sui/client";

export const SUI_NETWORK = "testnet";
export const SUI_RPC =
  import.meta.env.VITE_SUI_RPC || getFullnodeUrl(SUI_NETWORK);

export const PACKAGE_ID = import.meta.env.VITE_PACKAGE_ID || "";
export const MODULE = "dungeon";
export const MINT_FN = "mint_dungeon";
export const DUNGEON_CAP = import.meta.env.VITE_DUNGEON_CAP || "";

export const WALRUS_WASM_URL =
  import.meta.env.VITE_WALRUS_WASM_URL ||
  "https://unpkg.com/@mysten/walrus-wasm@latest/web/walrus_wasm_bg.wasm";

export const WALRUS_GATEWAY =
  import.meta.env.VITE_WALRUS_GATEWAY ||
  "https://wal-aggregator-testnet.staketab.org/v1/blobs/by-quilt-patch-id";

