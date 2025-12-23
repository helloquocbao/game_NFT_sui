import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  EXPAND_FEE_MIST,
  MODULE_NAME,
  PACKAGE_ID,
  REGISTRY_ID,
} from "../sui/config";

/**
 * TILE CODE
 * 0 = empty
 * 1 = wall
 * 2 = trap
 * 4 = enemy
 * 5 = floor 1
 * 6 = floor 2
 * 7 = floor 3
 * 8 = floor 4
 */

const TILE_SIZE = 32;
const CHUNK_SIZE = 16;
const VIEW_W = 10;
const VIEW_H = 10;

type Chunk = number[][];
type ChunkMap = Record<string, Chunk>;

const TILE_COLORS: Record<number, string> = {
  0: "#000",
  1: "#888",
  2: "#e53935",
  4: "#ff5050",
  5: "#546e7a",
  6: "#607d8b",
  7: "#78909c",
  8: "#90a4ae",
};

function makeEmptyChunk() {
  return Array(CHUNK_SIZE)
    .fill(0)
    .map(() => Array(CHUNK_SIZE).fill(0));
}

function chunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

function mod(value: number, size: number) {
  return ((value % size) + size) % size;
}

function getChunkCoords(x: number, y: number) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  const lx = mod(x, CHUNK_SIZE);
  const ly = mod(y, CHUNK_SIZE);
  return { cx, cy, lx, ly };
}

function getTile(chunks: ChunkMap, x: number, y: number) {
  const { cx, cy, lx, ly } = getChunkCoords(x, y);
  const chunk = chunks[chunkKey(cx, cy)];
  if (!chunk) return 0;
  return chunk[ly]?.[lx] ?? 0;
}

function isChunkEmpty(chunk: Chunk) {
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      if (chunk[y][x] !== 0) return false;
    }
  }
  return true;
}

function gridToChunks(grid: number[][]) {
  const chunks: ChunkMap = {};
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const value = grid[y][x];
      if (value === 0) continue;
      const { cx, cy, lx, ly } = getChunkCoords(x, y);
      const key = chunkKey(cx, cy);
      if (!chunks[key]) chunks[key] = makeEmptyChunk();
      chunks[key][ly][lx] = value;
    }
  }
  return chunks;
}

function encodeUtf8(value: string) {
  return Array.from(new TextEncoder().encode(value));
}

export default function EditorGame() {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const { mutate: signAndExecuteTransaction, isPending } =
    useSignAndExecuteTransaction();

  const [selectedTile, setSelectedTile] = useState<number>(1);

  const [chunks, setChunks] = useState<ChunkMap>({});
  const [viewOrigin, setViewOrigin] = useState({ x: 0, y: 0 });
  const [chunkCoord, setChunkCoord] = useState({ x: 0, y: 0 });
  const [walrusUri, setWalrusUri] = useState("");
  const [contentHash, setContentHash] = useState("");
  const [txStatus, setTxStatus] = useState("");

  useEffect(() => {
    loadMap();
  }, []);

  function loadMap() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);

      if (data?.chunks) {
        setChunks(data.chunks);
        return;
      }

      // Xử lý format cũ (tiles object)
      if (data.tiles && !data.grid) {
        const width = data.width || VIEW_W;
        const height = data.height || VIEW_H;
        const newGrid = Array(height)
          .fill(0)
          .map(() => Array(width).fill(0));

        for (const [key, value] of Object.entries(data.tiles)) {
          const [x, y] = key.split(",").map(Number);
          if (y < height && x < width) {
            newGrid[y][x] = value as number;
          }
        }

        setChunks(gridToChunks(newGrid));
      }
      // Format mới (grid array)
      else if (data.grid) {
        setChunks(gridToChunks(data.grid));
      }
    } catch (e) {
      console.error("Failed to load map:", e);
    }
  }

  function clearMap() {
    if (confirm("Xóa toàn bộ map?")) {
      setChunks({});
    }
  }

  function paint(x: number, y: number) {
    const globalX = viewOrigin.x + x;
    const globalY = viewOrigin.y + y;
    const { cx, cy, lx, ly } = getChunkCoords(globalX, globalY);
    const key = chunkKey(cx, cy);

    setChunks((prev) => {
      const existing = prev[key] ?? makeEmptyChunk();
      const nextChunk = existing.map((row) => [...row]);
      nextChunk[ly][lx] = selectedTile;
      return { ...prev, [key]: nextChunk };
    });
  }

  function saveMap() {
    const pruned = Object.fromEntries(
      Object.entries(chunks).filter(([, chunk]) => !isChunkEmpty(chunk))
    );

    const data = {
      version: 2,
      tileSize: TILE_SIZE,
      chunkSize: CHUNK_SIZE,
      chunks: pruned,
    };

    localStorage.setItem("CUSTOM_MAP", JSON.stringify(data));
    alert("✅ Map saved!");
  }

  function handleExpandChunk() {
    if (!account) {
      setTxStatus("Connect wallet first.");
      return;
    }
    if (!walrusUri || !contentHash) {
      setTxStatus("Walrus URI and content hash are required.");
      return;
    }
    if (chunkCoord.x < 0 || chunkCoord.y < 0) {
      setTxStatus("Chunk coordinates must be >= 0.");
      return;
    }

    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.gas, [tx.pure.u64(EXPAND_FEE_MIST)]);
    tx.moveCall({
      target: `${PACKAGE_ID}::${MODULE_NAME}::expand_chunk`,
      arguments: [
        tx.object(REGISTRY_ID),
        tx.pure.u64(BigInt(chunkCoord.x)),
        tx.pure.u64(BigInt(chunkCoord.y)),
        tx.pure.vector("u8", encodeUtf8(walrusUri)),
        tx.pure.vector("u8", encodeUtf8(contentHash)),
        payment,
      ],
    });

    setTxStatus("Submitting transaction...");
    signAndExecuteTransaction(
      { transaction: tx },
      {
        onSuccess: (result) => {
          setTxStatus(`Success: ${result.digest}`);
        },
        onError: (error) => {
          setTxStatus(error?.message ?? "Transaction failed.");
        },
      }
    );
  }

  function pan(dx: number, dy: number) {
    setViewOrigin((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }

  const visibleTiles = useMemo(() => {
    return Array.from({ length: VIEW_H }, (_, y) =>
      Array.from({ length: VIEW_W }, (_, x) => {
        const gx = viewOrigin.x + x;
        const gy = viewOrigin.y + y;
        return { x, y, value: getTile(chunks, gx, gy) };
      })
    );
  }, [chunks, viewOrigin]);

  const viewChunk = useMemo(() => {
    return {
      x: Math.floor(viewOrigin.x / CHUNK_SIZE),
      y: Math.floor(viewOrigin.y / CHUNK_SIZE),
    };
  }, [viewOrigin]);

  const canSubmit =
    !!account &&
    walrusUri.length > 0 &&
    contentHash.length > 0 &&
    chunkCoord.x >= 0 &&
    chunkCoord.y >= 0 &&
    !isPending;

  return (
    <div style={{ padding: 20 }}>
      <h2>🗺️ MAP EDITOR</h2>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div className="wallet-connect-btn">
          <ConnectButton />
        </div>
        <div style={{ alignSelf: "center", fontSize: 12 }}>
          {account ? `Wallet: ${account.address}` : "Wallet not connected"}
        </div>
      </div>

      <div
        style={{
          border: "1px solid #333",
          padding: 12,
          marginBottom: 16,
          maxWidth: 520,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 8 }}>
          Publish Chunk (On-Chain)
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ display: "grid", gap: 4 }}>
            Chunk X (u64)
            <input
              type="number"
              min={0}
              step={1}
              value={chunkCoord.x}
              onChange={(event) =>
                setChunkCoord((prev) => ({
                  ...prev,
                  x: Number(event.target.value),
                }))
              }
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Chunk Y (u64)
            <input
              type="number"
              min={0}
              step={1}
              value={chunkCoord.y}
              onChange={(event) =>
                setChunkCoord((prev) => ({
                  ...prev,
                  y: Number(event.target.value),
                }))
              }
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Walrus URI
            <input
              type="text"
              value={walrusUri}
              onChange={(event) => setWalrusUri(event.target.value)}
              placeholder="walrus://..."
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            Content Hash
            <input
              type="text"
              value={contentHash}
              onChange={(event) => setContentHash(event.target.value)}
              placeholder="sha256..."
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setChunkCoord(viewChunk)}
              disabled={viewChunk.x < 0 || viewChunk.y < 0}
            >
              Use View Chunk
            </button>
            <button
              type="button"
              onClick={handleExpandChunk}
              disabled={!canSubmit}
            >
              {isPending ? "Submitting..." : "Pay 1.3 SUI and Add Chunk"}
            </button>
          </div>
          {txStatus ? (
            <div style={{ fontSize: 12, color: "#cbd5f5" }}>{txStatus}</div>
          ) : null}
          <div style={{ fontSize: 12, color: "#94a3b8" }}>
            Chunk coordinates use chunk space (16x16 tiles) and must be lon hon
            0.
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <TileButton
          label="Empty"
          color={TILE_COLORS[0]}
          active={selectedTile === 0}
          onClick={() => setSelectedTile(0)}
        />
        <TileButton
          label="Wall"
          color={TILE_COLORS[1]}
          active={selectedTile === 1}
          onClick={() => setSelectedTile(1)}
        />
        <TileButton
          label="Trap"
          color={TILE_COLORS[2]}
          active={selectedTile === 2}
          onClick={() => setSelectedTile(2)}
        />
        <TileButton
          label="Floor 1"
          color={TILE_COLORS[5]}
          active={selectedTile === 5}
          onClick={() => setSelectedTile(5)}
        />
        <TileButton
          label="Floor 2"
          color={TILE_COLORS[6]}
          active={selectedTile === 6}
          onClick={() => setSelectedTile(6)}
        />
        <TileButton
          label="Floor 3"
          color={TILE_COLORS[7]}
          active={selectedTile === 7}
          onClick={() => setSelectedTile(7)}
        />
        <TileButton
          label="Floor 4"
          color={TILE_COLORS[8]}
          active={selectedTile === 8}
          onClick={() => setSelectedTile(8)}
        />
        <TileButton
          label="Enemy"
          color={TILE_COLORS[4]}
          active={selectedTile === 4}
          onClick={() => setSelectedTile(4)}
        />
      </div>

      {/* VIEWPORT CONTROLS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => pan(0, -1)}>⬆</button>
        <button onClick={() => pan(-1, 0)}>⬅</button>
        <button onClick={() => pan(1, 0)}>➡</button>
        <button onClick={() => pan(0, 1)}>⬇</button>
        <button onClick={() => setViewOrigin({ x: 0, y: 0 })}>
          Reset View
        </button>
        <span style={{ alignSelf: "center", marginLeft: 8 }}>
          View: ({viewOrigin.x}, {viewOrigin.y})
        </span>
      </div>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${VIEW_W}, ${TILE_SIZE}px)`,
          border: "2px solid #555",
          width: VIEW_W * TILE_SIZE,
        }}
      >
        {visibleTiles.map((row, y) =>
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              onClick={() => paint(x, y)}
              style={{
                width: TILE_SIZE,
                height: TILE_SIZE,
                background: TILE_COLORS[cell.value],
                border: "1px solid #333",
                cursor: "pointer",
              }}
            />
          ))
        )}
      </div>

      {/* ACTIONS */}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button onClick={saveMap}>💾 Save</button>
        <button onClick={loadMap}>📂 Load</button>
        <button onClick={clearMap}>🗑️ Clear</button>
        <button onClick={() => navigate("/game")}>▶ Play</button>
      </div>
    </div>
  );
}

function TileButton({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        border: active ? "2px solid #fff" : "2px solid transparent",
        background: color,
        color: "#000",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
