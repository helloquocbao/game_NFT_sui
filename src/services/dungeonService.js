import { SuiClient } from "@mysten/sui/client";
import {
  PACKAGE_ID,
  MODULE,
  SUI_RPC,
  SUI_NETWORK,
  WALRUS_GATEWAY,
  WALRUS_WASM_URL,
} from "../config/sui";

const client = new SuiClient({ url: SUI_RPC });
const DUNGEON_TYPE =
  PACKAGE_ID && MODULE ? `${PACKAGE_ID}::${MODULE}::Dungeon` : null;

// Tạo Walrus client để đọc/blob bằng SDK (tránh CORS)
const createWalrusClient = async () => {
  const { walrus } = await import("@mysten/walrus");
  const suiClient = new SuiClient({ url: SUI_RPC });
  return suiClient.$extend(
    walrus({
      wasmUrl: WALRUS_WASM_URL,
      network: SUI_NETWORK,
      uploadRelay: {
        host: "https://upload-relay.testnet.walrus.space",
        sendTip: {
          max: 1_000,
        },
      },
    })
  );
};

// Hàm này giữ lại để tương thích ngược, nhưng nên dùng imageUrl trực tiếp từ NFT
export const getWalrusImageUrl = (blobId) =>
  `${WALRUS_GATEWAY}/${blobId}`;

const validateMapJson = (map) => {
  if (!map || typeof map !== "object") return false;
  if (!map.layout || !Array.isArray(map.layout) || map.layout.length === 0)
    return false;
  const { config } = map;
  if (
    !config ||
    typeof config.width !== "number" ||
    typeof config.height !== "number" ||
    config.width <= 0 ||
    config.height <= 0
  )
    return false;
  // Optional strict check: each row length matches width
  const widthOk = map.layout.every(
    (row) => typeof row === "string" && row.length === config.width
  );
  return widthOk;
};

const parseDungeonObject = (item) => {
  if (!DUNGEON_TYPE) return null;
  const content = item.data?.content;
  if (!content || content.dataType !== "moveObject") return null;
  if (content.type !== DUNGEON_TYPE) return null;
  const f = content.fields;
  return {
    id: item.data?.objectId,
    name: f.name,
    blobId: f.blob_id,
    patchMapId: f.patch_map_id,
    imageUrl: f.image_url,
    creator: f.creator,
    likes: Number(f.likes || 0),
  };
};

export const fetchDungeonsByOwner = async (owner) => {
  if (!DUNGEON_TYPE || !owner) return [];
  const resp = await client.getOwnedObjects({
    owner,
    filter: { StructType: DUNGEON_TYPE },
    options: { showContent: true },
  });

  return resp.data.map(parseDungeonObject).filter(Boolean);
};

export const readDungeonMap = async (patchId) => {
  const walrusClient = await createWalrusClient();

  // getFiles nhận cả Blob ID lẫn Quilt ID
  const [file] = await walrusClient.walrus.getFiles({ ids: [patchId] });

  // file.json() sẽ parse đúng UTF-8 JSON
  return await file.json();
};

// http call - error CORS
// export const readDungeonMap = async () => {
//   const url = `${WALRUS_GATEWAY}/XYLHo4XQ58cg7hiqVqHCn60WZFMItH9P4r1L29cf7FkBAQADAA`;
//   const res = await fetch(url, { headers: { Accept: "application/json" }});
//   if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
//   return await res.json();
// };

export const fetchDungeonById = async (objectId) => {
  if (!DUNGEON_TYPE) return null;
  const resp = await client.getObject({
    id: objectId,
    options: { showContent: true, showOwner: true },
  });
  const content = resp.data?.content;
  if (!content || content.dataType !== "moveObject") return null;
  if (content.type !== DUNGEON_TYPE) return null;
  const f = content.fields;
  return {
    id: resp.data.objectId,
    owner: resp.data.owner?.AddressOwner || null, // Parse owner address
    name: f.name,
    blobId: f.blob_id,
    patchMapId: f.patch_map_id,
    imageUrl: f.image_url,
    creator: f.creator,
    likes: Number(f.likes || 0),
  };
};

export const loadDungeonsFromWallet = async (owner, { hydrate = true } = {}) => {
  const base = await fetchDungeonsByOwner(owner);
  if (!hydrate) return base;

  const enriched = await Promise.all(
    base.map(async (d) => {
      try {
        // Sử dụng patchMapId để đọc map (nếu có), fallback về blobId
        const idToUse = d.patchMapId || d.blobId;
        if (!idToUse) return null;
        const map = await readDungeonMap(idToUse);
        if (!validateMapJson(map)) return null;
        return {
          ...d,
          settings: map,
        };
      } catch {
        return null;
      }
    })
  );

  return enriched.filter(Boolean);
};

export const validateMapJsonSchema = validateMapJson;

