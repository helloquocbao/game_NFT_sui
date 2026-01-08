export const SUI_RPC_URL =
  import.meta.env.VITE_SUI_RPC ?? "https://fullnode.testnet.sui.io";

export const PACKAGE_ID =
  import.meta.env.VITE_PACKAGE_ID ??
  "0x73bfcc7ecc5ebe9a90b4632c0769d3655cd2419f69edfb7cbc84f1f6320eeeaf";
export const ADMIN_CAP_ID =
  import.meta.env.VITE_ADMIN_CAP ??
  "0x55ca72bba3fa8115b4d49b750838d652cbd675ad26608ce6ae0d399d60a10707";
export const WORLD_REGISTRY_ID =
  import.meta.env.VITE_WORLD_REGISTRY ??
  "0x73766dd849d5f5091ce941ced531c68166e24ada28844e8fe4cbd44fe9fc7b1b";
export const REWARD_VAULT_ID =
  import.meta.env.VITE_REWARD_VAULT ??
  "0x5e581cdf99eada8a8ec961edd8770cb3f05e7ed763106c2860aa914bcd286f0e";
export const TREASURY_CAP_ID =
  import.meta.env.VITE_TREASURY_CAP ??
  "0x893d9653d36c3ca9cd5f0aa27bc38373a54f48bccc7b11c66eec9843e3df532d";
export const REWARD_COIN_TYPE = PACKAGE_ID
  ? `${PACKAGE_ID}::reward_coin::REWARD_COIN`
  : "";
export const RANDOM_OBJECT_ID =
  import.meta.env.VITE_RANDOM_OBJECT_ID ?? "0x8";
