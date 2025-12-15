# Walrus Dungeon (Giai đoạn 2 - Testnet)

Web3 dungeon builder: upload map/thumbnail lên Walrus, mint NFT dungeon trên Sui testnet, gallery + play từ on-chain data.

## Cài đặt
```bash
pnpm install
pnpm dev
```

## Env
Tạo file `.env` dựa trên `env.example`:
```
VITE_SUI_RPC=https://fullnode.testnet.sui.io
VITE_PACKAGE_ID=0x...            # package sau khi publish move-contract
VITE_DUNGEON_CAP=0x...           # object DungeonCap share
VITE_WALRUS_WASM_URL=https://unpkg.com/@mysten/walrus-wasm@latest/web/walrus_wasm_bg.wasm
VITE_WALRUS_GATEWAY=https://wal-aggregator-testnet.staketab.org/v1/blobs
```

Deployed testnet (hiện tại):
- PACKAGE_ID: `0xaba6a790db8ea23d5713f397452d5ef42ebc0861b91e5ca85dd15d3f04b608fc`
- DungeonCap (shared): `0x7497d53ea4e2555470a1fd865fbd016118c66222b72146d6e9005e389414201f`
- Tx publish: `EuAq8fwcQaNFabT7NAUzBMuy6ZiTskwfhtwzTZeLzXJD`
- Explorer: https://suiexplorer.com/txblock/EuAq8fwcQaNFabT7NAUzBMuy6ZiTskwfhtwzTZeLzXJD?network=testnet

## Move contract (move_contract/)
Module: `walrus_dungeon::dungeon`
- Struct `Dungeon { name, blob_id, patch_map_id, image_url, creator, likes }`
- Shared `DungeonCap` (counter)
- Entry `mint_dungeon(name, blob_id, patch_map_id, image_url, cap, recipient)`
- Optional `burn_dungeon`

Triển khai testnet (yêu cầu Sui CLI):
```bash
cd move_contract
sui move build
sui client publish --gas-budget 500000000
```
Ghi lại `PACKAGE_ID`, `DungeonCap` (object share) vào `.env`.

## Luồng Save & Mint (Editor)
1) Validate map: 1 player, không trống, size <= 300x100, ký tự hợp lệ.
2) Upload map JSON lên Walrus -> lấy `blob_id` và `patch_map_id`.
3) Upload thumbnail lên Walrus -> lấy `patch_id`, tạo `image_url` = `https://wal-aggregator-testnet.staketab.org/v1/blobs/by-quilt-patch-id/{patch_id}`.
4) Gọi Move `mint_dungeon` trên Sui testnet với `blob_id`, `patch_map_id` và `image_url`.

## Gallery & Play
- Gallery ưu tiên dữ liệu on-chain (đọc objects type `Dungeon` của ví), fallback mock khi chưa cấu hình package/env.
- Play page đọc blob JSON từ Walrus, render Kaboom.
- Thumbnail hiển thị từ `image_url` trong NFT metadata (không cần đọc từ Walrus gateway).

## Thư viện chính
- @mysten/dapp-kit, @mysten/sui, @tanstack/react-query
- @mysten/walrus (SDK thật)
- Kaboom (render game)

## Testing gợi ý
- Upload fail / tx bị reject / tx thành công
- Play với map lớn, có trap/enemy/coin/player
- Thumbnail fail -> fallback
- Không đủ env (PACKAGE_ID, DUNGEON_CAP) -> hiển thị lỗi rõ ràng
