import { useCallback, useState } from "react";
import { useCurrentAccount, useSignAndExecuteTransaction } from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  PACKAGE_ID,
  MODULE,
  MINT_FN,
  DUNGEON_CAP,
} from "../config/sui";

export function useDungeonMint() {
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [isMinting, setIsMinting] = useState(false);

  const mintDungeon = useCallback(
    async ({ name, blobId, patchMapId, imageUrl }) => {
      if (!account) throw new Error("Chưa kết nối ví");
      if (!PACKAGE_ID || !DUNGEON_CAP) {
        throw new Error("Thiếu PACKAGE_ID hoặc DUNGEON_CAP trong env");
      }

      setIsMinting(true);
      try {
        const tx = new Transaction();
        tx.moveCall({
          target: `${PACKAGE_ID}::${MODULE}::${MINT_FN}`,
          arguments: [
            tx.pure.vector("u8", Array.from(new TextEncoder().encode(name))),
            tx.pure.vector("u8", Array.from(new TextEncoder().encode(blobId))),
            tx.pure.vector("u8", Array.from(new TextEncoder().encode(patchMapId))),
            tx.pure.vector(
              "u8",
              Array.from(new TextEncoder().encode(imageUrl))
            ),
            tx.object(DUNGEON_CAP),
            tx.pure.address(account.address),
          ],
        });

        return await new Promise((resolve, reject) => {
          signAndExecuteTransaction(
            { transaction: tx },
            {
              onSuccess: (result) => resolve(result.digest),
              onError: (err) => reject(err),
            }
          );
        });
      } finally {
        setIsMinting(false);
      }
    },
    [account, signAndExecuteTransaction]
  );

  return { mintDungeon, isMinting };
}

