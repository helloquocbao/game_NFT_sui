import { useCallback, useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { WalrusFile } from "@mysten/walrus";
import { SuiClient } from "@mysten/sui/client";
import { SUI_NETWORK, SUI_RPC, WALRUS_WASM_URL } from "../config/sui";

const WALRUS_EPOCHS = 3;

const createWalrusClient = async () => {
  const { walrus } = await import("@mysten/walrus");
  const client = new SuiClient({ url: SUI_RPC });
  return client.$extend(
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

const walrusFileFromBytes = (name, bytes, contentType) =>
  WalrusFile.from({
    contents: bytes,
    identifier: name,
    tags: {
      "content-type": contentType,
      "file-name": name,
    },
  });

export function useWalrusUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const executeTransaction = useCallback(
    (tx) =>
      new Promise((resolve, reject) => {
        signAndExecuteTransaction(
          { transaction: tx },
          {
            onSuccess: (result) => resolve(result.digest),
            onError: (err) => reject(err),
          }
        );
      }),
    [signAndExecuteTransaction]
  );

  // Upload chỉ map JSON lên Walrus
  const uploadMap = useCallback(
    async (mapJson) => {
      if (!account) throw new Error("Chưa kết nối ví");
      setIsUploading(true);
      try {
        const client = await createWalrusClient();
        
        // Chỉ upload map JSON
        const jsonBytes = new TextEncoder().encode(
          JSON.stringify(mapJson, null, 2)
        );
        const files = [
          walrusFileFromBytes(
            `dungeon-map-${Date.now()}.json`,
            jsonBytes,
            "application/json"
          ),
        ];

        const flow = client.walrus.writeFilesFlow({ files });
        await flow.encode();

        const registerTx = flow.register({
          epochs: WALRUS_EPOCHS,
          owner: account.address,
          deletable: true,
        });
        const registerDigest = await executeTransaction(registerTx);

        await flow.upload({ digest: registerDigest });

        const certifyTx = flow.certify();
        await executeTransaction(certifyTx);

        const uploaded = await flow.listFiles();
        if (!uploaded.length) throw new Error("Upload thất bại: không có file");

        const jsonFile = uploaded[0];
        return {
          blobId: jsonFile.blobId,
          patchId: jsonFile.id,
        };
      } finally {
        setIsUploading(false);
      }
    },
    [account, executeTransaction]
  );

  // Upload image riêng để lấy patchId và tạo URL
  const uploadImage = useCallback(
    async (imageBlob) => {
      if (!account) throw new Error("Chưa kết nối ví");
      setIsUploading(true);
      try {
        const client = await createWalrusClient();
        
        const buffer = await imageBlob.arrayBuffer();
        const files = [
          walrusFileFromBytes(
            `dungeon-thumb-${Date.now()}.png`,
            new Uint8Array(buffer),
            imageBlob.type || "image/png"
          ),
        ];

        const flow = client.walrus.writeFilesFlow({ files });
        await flow.encode();

        const registerTx = flow.register({
          epochs: WALRUS_EPOCHS,
          owner: account.address,
          deletable: true,
        });
        const registerDigest = await executeTransaction(registerTx);

        await flow.upload({ digest: registerDigest });

        const certifyTx = flow.certify();
        await executeTransaction(certifyTx);

        const uploaded = await flow.listFiles();
        if (!uploaded.length) throw new Error("Upload image thất bại");

        const imageFile = uploaded[0];
        return {
          blobId: imageFile.blobId,
          patchId: imageFile.id,
        };
      } finally {
        setIsUploading(false);
      }
    },
    [account, executeTransaction]
  );

  // Giữ lại uploadFiles để tương thích ngược (deprecated)
  const uploadFiles = useCallback(
    async ({ mapJson, thumbnailBlob }) => {
      const mapResult = await uploadMap(mapJson);
      let imageResult = null;
      if (thumbnailBlob) {
        imageResult = await uploadImage(thumbnailBlob);
      }
      return {
        map: mapResult,
        image: imageResult,
      };
    },
    [uploadMap, uploadImage]
  );

  // Combined upload: Map JSON + Thumbnail Image in one flow
  const uploadCombinedDungeon = useCallback(
    async (mapJson, imageBlob) => {
      if (!account) throw new Error("Wallet not connected");
      setIsUploading(true);
      try {
        const client = await createWalrusClient();

        // 1. Prepare JSON Map file
        const jsonBytes = new TextEncoder().encode(
          JSON.stringify(mapJson, null, 2)
        );
        const mapFileName = `dungeon-map-${Date.now()}.json`;
        const mapFile = walrusFileFromBytes(
          mapFileName,
          jsonBytes,
          "application/json"
        );

        // 2. Prepare Image file
        const buffer = await imageBlob.arrayBuffer();
        const imageFileName = `dungeon-thumb-${Date.now()}.png`;
        const imageFile = walrusFileFromBytes(
          imageFileName,
          new Uint8Array(buffer),
          imageBlob.type || "image/png"
        );

        // 3. Create combined flow
        const files = [mapFile, imageFile];
        const flow = client.walrus.writeFilesFlow({ files });
        await flow.encode();

        // 4. Register (single transaction for both files)
        const registerTx = flow.register({
          epochs: WALRUS_EPOCHS,
          owner: account.address,
          deletable: true,
        });
        const registerDigest = await executeTransaction(registerTx);

        // 5. Upload
        await flow.upload({ digest: registerDigest });

        // 6. Certify (single transaction)
        const certifyTx = flow.certify();
        await executeTransaction(certifyTx);

        // 7. Get Results
        const uploaded = await flow.listFiles();
        if (uploaded.length < 2) throw new Error("Upload failed: missing files");

        // Identify which file is which based on media_type or exact order
        // walrusFileFromBytes sets content-type in tags, but listFiles metadata might differ slightly depending on node
        // Best reliance: order is preserved or check content type if available.
        // Assuming order [map, image] because that's how we passed it.
        // Or cleaner: check media_type if available in response, or name if available.
        // The mocked response usually preserves order.

        const mapResult = uploaded[0];
        const imageResult = uploaded[1];

        return {
          mapCtx: {
            blobId: mapResult.blobId,
            patchId: mapResult.id,
          },
          imageCtx: {
            blobId: imageResult.blobId,
            patchId: imageResult.id,
          },
        };
      } finally {
        setIsUploading(false);
      }
    },
    [account, executeTransaction]
  );

  return { uploadFiles, uploadMap, uploadImage, uploadCombinedDungeon, isUploading };
}

