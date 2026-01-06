import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  ADMIN_CAP_ID,
  PACKAGE_ID,
  SUI_RPC_URL,
  WORLD_REGISTRY_ID,
} from "../chain/config";
import { suiClient } from "../chain/suiClient";
import "./EditorGame.css";

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
const CHUNK_SIZE = 8;
const DEFAULT_FLOOR = 5;
const MAP_KEY = "CUSTOM_MAP";
const USER_ID_KEY = "EDITOR_USER_ID";

const TILE_COLORS: Record<number, string> = {
  0: "#0b0b0b",
  1: "#8d8d8d",
  2: "#e04a3a",
  4: "#ff6b4a",
  5: "#58646b",
  6: "#697680",
  7: "#81919b",
  8: "#9aa9b1",
};

type Direction = "left" | "right" | "top" | "bottom";
type ChunkOwners = Record<string, string>;

export default function EditorGame() {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();

  const initialUserId = getOrCreateUserId();
  const [userId, setUserId] = useState(initialUserId);
  const [notice, setNotice] = useState<string>("");
  const [selectedTile, setSelectedTile] = useState<number>(1);
  const [grid, setGrid] = useState<number[][]>(() => createDefaultGrid());
  const [chunkOwners, setChunkOwners] = useState<ChunkOwners>(() =>
    createOwnersForGrid(createDefaultGrid(), initialUserId)
  );
  const [worldId, setWorldId] = useState<string>("");
  const [worldOverride, setWorldOverride] = useState<string>("");
  const [chainError, setChainError] = useState<string>("");
  const [txDigest, setTxDigest] = useState<string>("");
  const [txError, setTxError] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string>("");

  const [chunkCx, setChunkCx] = useState("0");
  const [chunkCy, setChunkCy] = useState("0");
  const [claimImageUrl, setClaimImageUrl] = useState("");
  const [chunkObjectId, setChunkObjectId] = useState("");
  const [updateImageUrl, setUpdateImageUrl] = useState("");
  const [tileX, setTileX] = useState("0");
  const [tileY, setTileY] = useState("0");

  useEffect(() => {
    loadMap();
  }, []);

  useEffect(() => {
    loadWorldId();
  }, [WORLD_REGISTRY_ID]);

  const gridWidth = grid[0]?.length ?? 0;
  const gridHeight = grid.length;
  const worldIdValue = worldOverride.trim() || worldId;
  const isConnected = Boolean(account?.address);
  const isBusy = isPending || Boolean(busyAction);

  const mapStats = useMemo(() => {
    const cols = Math.ceil(gridWidth / CHUNK_SIZE);
    const rows = Math.ceil(gridHeight / CHUNK_SIZE);
    return { cols, rows };
  }, [gridWidth, gridHeight]);

  /* ================= MAP IO ================= */

  function saveMap() {
    const data = {
      tileSize: TILE_SIZE,
      width: grid[0].length,
      height: grid.length,
      grid,
      chunkOwners,
    };
    localStorage.setItem(MAP_KEY, JSON.stringify(data));
    setNotice("Map saved.");
  }

  function loadMap() {
    const raw = localStorage.getItem(MAP_KEY);
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.grid) {
        setGrid(data.grid);
        const owners =
          data.chunkOwners ?? createOwnersForGrid(data.grid, userId);
        setChunkOwners(owners);
      }
    } catch (error) {
      console.error(error);
    }
  }

  function clearMap() {
    if (confirm("Clear the entire map?")) {
      const freshGrid = createDefaultGrid();
      setGrid(freshGrid);
      setChunkOwners(createOwnersForGrid(freshGrid, userId));
      setNotice("");
    }
  }

  /* ================= EDIT ================= */

  function paint(x: number, y: number) {
    const owner = getChunkOwnerAt(chunkOwners, x, y);
    if (owner !== userId) {
      setNotice(owner ? `Chunk owned by ${owner}.` : "Chunk has no owner.");
      return;
    }
    setNotice("");
    setGrid((prev) => {
      const copy = prev.map((row) => [...row]);
      copy[y][x] = selectedTile;
      return copy;
    });
  }

  /* ================= CHUNK LOGIC ================= */

  function addRandomChunk() {
    const directions: Direction[] = ["left", "right", "top", "bottom"];
    const candidates: { x: number; y: number }[] = [];
    const seen = new Set<string>();

    for (const dir of directions) {
      for (const candidate of findAttachCandidates(grid, dir)) {
        const key = `${candidate.x},${candidate.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(candidate);
      }
    }

    if (candidates.length === 0) {
      setNotice("No attachable chunk found.");
      return;
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const chunk = createChunk(DEFAULT_FLOOR);
    const result = mergeChunk(
      grid,
      chunkOwners,
      chunk,
      chosen.x,
      chosen.y,
      userId
    );
    setGrid(result.grid);
    setChunkOwners(result.owners);
    setNotice("");
  }

  function changeUser() {
    const next = prompt("Set user id", userId)?.trim();
    if (!next) return;
    setUserId(next);
    localStorage.setItem(USER_ID_KEY, next);
    setNotice(`User set to ${next}.`);
  }

  /* ================= CHAIN IO ================= */

  async function loadWorldId() {
    setChainError("");
    if (!WORLD_REGISTRY_ID) {
      setWorldId("");
      return;
    }

    try {
      const result = await suiClient.getObject({
        id: WORLD_REGISTRY_ID,
        options: { showContent: true },
      });
      const content = result.data?.content;
      if (!content || content.dataType !== "moveObject") {
        setWorldId("");
        return;
      }

      const fields = content.fields as Record<string, unknown>;
      const worldField = fields.world_id as
        | { vec?: unknown[]; fields?: { vec?: unknown[] } }
        | undefined;
      const vec = worldField?.vec ?? worldField?.fields?.vec;
      const id = Array.isArray(vec) && vec.length > 0 ? String(vec[0]) : "";
      setWorldId(id);
    } catch (error) {
      setChainError(error instanceof Error ? error.message : String(error));
      setWorldId("");
    }
  }

  async function resolveChunkId() {
    setTxError("");
    if (!PACKAGE_ID) {
      setTxError("Missing package id.");
      return;
    }
    if (!worldIdValue) {
      setTxError("World id missing.");
      return;
    }

    try {
      const cx = parseCoord(chunkCx);
      const cy = parseCoord(chunkCy);
      const result = await suiClient.getDynamicFieldObject({
        parentId: worldIdValue,
        name: {
          type: `${PACKAGE_ID}::world::ChunkKey`,
          value: { cx, cy },
        },
      });

      const content = result.data?.content;
      if (!content || content.dataType !== "moveObject") {
        setTxError("Chunk not found.");
        return;
      }

      const fields = content.fields as Record<string, unknown>;
      const resolved = extractObjectId(fields.value);
      if (!resolved) {
        setTxError("Could not parse chunk id.");
        return;
      }

      setChunkObjectId(resolved);
    } catch (error) {
      setTxError(error instanceof Error ? error.message : String(error));
    }
  }

  async function runTx(
    label: string,
    build: (tx: Transaction) => void,
    onSuccess?: () => void
  ) {
    setTxError("");
    setTxDigest("");

    if (!isConnected) {
      setTxError("Connect wallet first.");
      return;
    }
    if (!PACKAGE_ID) {
      setTxError("Missing package id.");
      return;
    }

    setBusyAction(label);
    try {
      const tx = new Transaction();
      build(tx);
      const result = await signAndExecute({ transaction: tx });
      setTxDigest(result.digest);
      onSuccess?.();
    } catch (error) {
      setTxError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction("");
    }
  }

  function validateChunkInGrid(cx: number, cy: number) {
    if (cx < 0 || cy < 0) return false;
    if (cx >= mapStats.cols || cy >= mapStats.rows) return false;
    return true;
  }

  async function createWorldOnChain() {
    if (!WORLD_REGISTRY_ID || !ADMIN_CAP_ID) {
      setTxError("Missing registry or admin cap id.");
      return;
    }

    await runTx(
      "Create world",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::create_world`,
          arguments: [tx.object(WORLD_REGISTRY_ID), tx.object(ADMIN_CAP_ID)],
        });
      },
      () => loadWorldId()
    );
  }

  async function claimChunkOnChain() {
    if (!worldIdValue) {
      setTxError("World id missing.");
      return;
    }

    const cx = parseCoord(chunkCx);
    const cy = parseCoord(chunkCy);
    if (!validateChunkInGrid(cx, cy)) {
      setTxError("Chunk coords are outside the local grid.");
      return;
    }

    const tiles = buildChunkTiles(grid, cx, cy);
    const imageUrl = claimImageUrl.trim();

    await runTx(
      "Claim chunk",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::claim_chunk`,
          arguments: [
            tx.object(worldIdValue),
            tx.pure.u32(cx),
            tx.pure.u32(cy),
            tx.pure.string(imageUrl),
            tx.pure.vector("u8", tiles),
          ],
        });
      },
      () => resolveChunkId()
    );
  }

  async function updateTilesOnChain() {
    if (!chunkObjectId.trim()) {
      setTxError("Chunk object id missing.");
      return;
    }

    const cx = parseCoord(chunkCx);
    const cy = parseCoord(chunkCy);
    if (!validateChunkInGrid(cx, cy)) {
      setTxError("Chunk coords are outside the local grid.");
      return;
    }

    const tiles = buildChunkTiles(grid, cx, cy);

    await runTx("Set tiles", (tx) => {
      tx.moveCall({
        target: `${PACKAGE_ID}::world::set_tiles`,
        arguments: [tx.object(chunkObjectId.trim()), tx.pure.vector("u8", tiles)],
      });
    });
  }

  async function updateSingleTileOnChain() {
    if (!chunkObjectId.trim()) {
      setTxError("Chunk object id missing.");
      return;
    }

    const x = clampU8(parseCoord(tileX), 7);
    const y = clampU8(parseCoord(tileY), 7);
    const tile = clampU8(selectedTile, 8);

    await runTx("Set tile", (tx) => {
      tx.moveCall({
        target: `${PACKAGE_ID}::world::set_tile`,
        arguments: [
          tx.object(chunkObjectId.trim()),
          tx.pure.u8(x),
          tx.pure.u8(y),
          tx.pure.u8(tile),
        ],
      });
    });
  }

  async function updateImageUrlOnChain() {
    if (!chunkObjectId.trim()) {
      setTxError("Chunk object id missing.");
      return;
    }

    const imageUrl = updateImageUrl.trim();

    await runTx("Set image url", (tx) => {
      tx.moveCall({
        target: `${PACKAGE_ID}::world::set_image_url`,
        arguments: [tx.object(chunkObjectId.trim()), tx.pure.string(imageUrl)],
      });
    });
  }

  /* ================= UI ================= */

  return (
    <div className="editor-page">
      <div className="editor-shell">
        <header className="editor-header">
          <div>
            <div className="editor-eyebrow">Skyworld editor</div>
            <h1 className="editor-title">Stone chunk workshop</h1>
            <p className="editor-subtitle">
              Carve floating chunks and push updates on-chain.
            </p>
          </div>

          <div className="editor-wallet">
            <div className="wallet-connect-btn">
              <ConnectButton />
            </div>
            <div className="wallet-meta">
              <span>Wallet</span>
              <span>{shortAddress(account?.address) || "not connected"}</span>
            </div>
          </div>
        </header>

        <div className="editor-layout">
          <section className="editor-main">
            <div className="panel panel--main">
              <div className="panel__header">
                <div>
                  <div className="panel__eyebrow">Stone canvas</div>
                  <div className="panel__title">Chunk grid</div>
                </div>
                <div className="panel__meta">
                  <div>
                    Size: {gridWidth} x {gridHeight}
                  </div>
                  <div>User: {userId}</div>
                </div>
              </div>

              {notice && <div className="panel__notice">{notice}</div>}

              <div className="editor-toolbar">
                <button className="btn btn--outline" onClick={changeUser}>
                  Switch user
                </button>
                <button className="btn btn--ghost" onClick={addRandomChunk}>
                  Add stone chunk
                </button>
              </div>

              <div className="editor-tiles">
                {Object.entries(TILE_COLORS).map(([id, color]) => (
                  <TileButton
                    key={id}
                    label={id}
                    color={color}
                    active={selectedTile === Number(id)}
                    onClick={() => setSelectedTile(Number(id))}
                  />
                ))}
              </div>

              <div className="editor-grid-wrap">
                <div
                  className="editor-grid"
                  style={{
                    gridTemplateColumns: `repeat(${gridWidth}, ${TILE_SIZE}px)`,
                    width: gridWidth * TILE_SIZE,
                  }}
                >
                  {grid.map((row, y) =>
                    row.map((cell, x) => {
                      const owner = getChunkOwnerAt(chunkOwners, x, y);
                      const canEdit = owner === userId;

                      return (
                        <button
                          key={`${x}-${y}`}
                          className="editor-tile"
                          onClick={() => paint(x, y)}
                          title={`Owner: ${owner ?? "none"}`}
                          style={{
                            background: TILE_COLORS[cell],
                            cursor: canEdit ? "pointer" : "not-allowed",
                          }}
                        />
                      );
                    })
                  )}
                </div>
              </div>

              <div className="editor-actions">
                <button className="btn btn--primary" onClick={saveMap}>
                  Save
                </button>
                <button className="btn btn--ghost" onClick={loadMap}>
                  Load
                </button>
                <button className="btn btn--outline" onClick={clearMap}>
                  Clear
                </button>
                <button className="btn btn--dark" onClick={() => navigate("/game")}>
                  Play
                </button>
              </div>
            </div>
          </section>

          <aside className="editor-side">
            <div className="panel">
              <div className="panel__title">Chain config</div>
              <div className="panel__rows">
                <div>
                  <span>RPC</span>
                  <span>{shortAddress(SUI_RPC_URL) || "not set"}</span>
                </div>
                <div>
                  <span>Package</span>
                  <span>{shortAddress(PACKAGE_ID) || "missing"}</span>
                </div>
                <div>
                  <span>Admin cap</span>
                  <span>{shortAddress(ADMIN_CAP_ID) || "missing"}</span>
                </div>
                <div>
                  <span>Registry</span>
                  <span>{shortAddress(WORLD_REGISTRY_ID) || "missing"}</span>
                </div>
                <div>
                  <span>World</span>
                  <span>{shortAddress(worldId) || "not created"}</span>
                </div>
              </div>

              <div className="panel__field">
                <label>World override</label>
                <input
                  value={worldOverride}
                  onChange={(event) => setWorldOverride(event.target.value)}
                  placeholder="0x..."
                />
              </div>

              <div className="panel__actions">
                <button className="btn btn--ghost" onClick={loadWorldId}>
                  Refresh world
                </button>
              </div>

              {chainError && <div className="panel__error">{chainError}</div>}
            </div>

            <div className="panel">
              <div className="panel__title">World admin</div>
              <p className="panel__desc">
                Create the shared world object using the admin cap.
              </p>
              <button
                className="btn btn--primary"
                onClick={createWorldOnChain}
                disabled={isBusy || !isConnected}
              >
                {busyAction === "Create world" ? "Creating..." : "Create world"}
              </button>
            </div>

            <div className="panel">
              <div className="panel__title">Claim chunk</div>
              <p className="panel__desc">
                Uses the local chunk tiles for the selected coordinates.
              </p>
              <div className="panel__grid">
                <div className="panel__field">
                  <label>CX</label>
                  <input
                    type="number"
                    min="0"
                    value={chunkCx}
                    onChange={(event) => setChunkCx(event.target.value)}
                  />
                </div>
                <div className="panel__field">
                  <label>CY</label>
                  <input
                    type="number"
                    min="0"
                    value={chunkCy}
                    onChange={(event) => setChunkCy(event.target.value)}
                  />
                </div>
              </div>
              <div className="panel__field">
                <label>Image URL</label>
                <input
                  value={claimImageUrl}
                  onChange={(event) => setClaimImageUrl(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <button
                className="btn btn--dark"
                onClick={claimChunkOnChain}
                disabled={isBusy || !isConnected}
              >
                {busyAction === "Claim chunk" ? "Claiming..." : "Claim chunk"}
              </button>
            </div>

            <div className="panel">
              <div className="panel__title">Update chunk</div>
              <div className="panel__field">
                <label>Chunk object id</label>
                <input
                  value={chunkObjectId}
                  onChange={(event) => setChunkObjectId(event.target.value)}
                  placeholder="0x..."
                />
              </div>
              <div className="panel__actions">
                <button
                  className="btn btn--outline"
                  onClick={resolveChunkId}
                  disabled={isBusy}
                >
                  Resolve from world
                </button>
              </div>

              <div className="panel__grid">
                <div className="panel__field">
                  <label>Tile X</label>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={tileX}
                    onChange={(event) => setTileX(event.target.value)}
                  />
                </div>
                <div className="panel__field">
                  <label>Tile Y</label>
                  <input
                    type="number"
                    min="0"
                    max="7"
                    value={tileY}
                    onChange={(event) => setTileY(event.target.value)}
                  />
                </div>
                <div className="panel__field">
                  <label>Tile value</label>
                  <div
                    className="tile-preview"
                    style={{ background: TILE_COLORS[selectedTile] }}
                  >
                    {selectedTile}
                  </div>
                </div>
              </div>

              <div className="panel__actions">
                <button
                  className="btn btn--ghost"
                  onClick={updateSingleTileOnChain}
                  disabled={isBusy || !isConnected}
                >
                  {busyAction === "Set tile" ? "Updating..." : "Set tile"}
                </button>
                <button
                  className="btn btn--outline"
                  onClick={updateTilesOnChain}
                  disabled={isBusy || !isConnected}
                >
                  {busyAction === "Set tiles" ? "Updating..." : "Set tiles"}
                </button>
              </div>

              <div className="panel__field">
                <label>Image URL</label>
                <input
                  value={updateImageUrl}
                  onChange={(event) => setUpdateImageUrl(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <button
                className="btn btn--dark"
                onClick={updateImageUrlOnChain}
                disabled={isBusy || !isConnected}
              >
                {busyAction === "Set image url" ? "Updating..." : "Set image"}
              </button>
            </div>

            <div className="panel panel--status">
              <div className="panel__title">Transaction status</div>
              <div className="panel__rows">
                <div>
                  <span>Wallet</span>
                  <span>{shortAddress(account?.address) || "not connected"}</span>
                </div>
                <div>
                  <span>Action</span>
                  <span>{busyAction || "idle"}</span>
                </div>
                <div>
                  <span>Digest</span>
                  <span>{txDigest || "-"}</span>
                </div>
              </div>
              {txError && <div className="panel__error">{txError}</div>}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ================= HELPERS ================= */

function getOrCreateUserId() {
  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) return stored;
  const generated = `user_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

function makeChunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

function getChunkKeyFromTile(x: number, y: number) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  return makeChunkKey(cx, cy);
}

function getChunkOwnerAt(owners: ChunkOwners, x: number, y: number) {
  return owners[getChunkKeyFromTile(x, y)];
}

function createOwnersForGrid(grid: number[][], ownerId: string): ChunkOwners {
  const owners: ChunkOwners = {};
  if (grid.length === 0 || grid[0].length === 0) return owners;

  const cols = Math.ceil(grid[0].length / CHUNK_SIZE);
  const rows = Math.ceil(grid.length / CHUNK_SIZE);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      owners[makeChunkKey(cx, cy)] = ownerId;
    }
  }

  return owners;
}

function shiftChunkOwners(owners: ChunkOwners, shiftX: number, shiftY: number) {
  const shifted: ChunkOwners = {};
  for (const [key, owner] of Object.entries(owners)) {
    const [cx, cy] = key.split(",").map(Number);
    shifted[makeChunkKey(cx + shiftX, cy + shiftY)] = owner;
  }
  return shifted;
}

function isChunkSolid(grid: number[][], startX: number, startY: number) {
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      if (grid[startY + y]?.[startX + x] >= 5) {
        return true;
      }
    }
  }
  return false;
}

function isChunkEmpty(grid: number[][], startX: number, startY: number) {
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const gy = startY + y;
      const gx = startX + x;

      if (gy < 0 || gy >= grid.length || gx < 0 || gx >= grid[0].length) {
        continue;
      }

      if (grid[gy][gx] !== 0) {
        return false;
      }
    }
  }
  return true;
}

function findAttachCandidates(grid: number[][], dir: Direction) {
  const width = grid[0].length;
  const height = grid.length;
  const candidates: { x: number; y: number }[] = [];

  for (let y = 0; y <= height - CHUNK_SIZE; y += CHUNK_SIZE) {
    for (let x = 0; x <= width - CHUNK_SIZE; x += CHUNK_SIZE) {
      if (!isChunkSolid(grid, x, y)) continue;

      let nx = x;
      let ny = y;

      if (dir === "top") ny = y - CHUNK_SIZE;
      if (dir === "bottom") ny = y + CHUNK_SIZE;
      if (dir === "left") nx = x - CHUNK_SIZE;
      if (dir === "right") nx = x + CHUNK_SIZE;

      if (isChunkEmpty(grid, nx, ny)) {
        candidates.push({ x: nx, y: ny });
      }
    }
  }

  return candidates;
}

function createDefaultGrid() {
  return Array(CHUNK_SIZE)
    .fill(0)
    .map(() => Array(CHUNK_SIZE).fill(DEFAULT_FLOOR));
}

function createChunk(tile: number) {
  const chunk = Array(CHUNK_SIZE)
    .fill(0)
    .map(() => Array(CHUNK_SIZE).fill(tile));

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const isEdge =
        x === 0 || y === 0 || x === CHUNK_SIZE - 1 || y === CHUNK_SIZE - 1;

      if (isEdge && Math.random() < 0.35) {
        chunk[y][x] = 0;
      }
    }
  }

  return chunk;
}

function mergeChunk(
  grid: number[][],
  owners: ChunkOwners,
  chunk: number[][],
  startX: number,
  startY: number,
  ownerId: string
) {
  const width = grid[0].length;
  const height = grid.length;

  const leftPad = Math.max(0, -startX);
  const topPad = Math.max(0, -startY);
  const rightPad = Math.max(0, startX + CHUNK_SIZE - width);
  const bottomPad = Math.max(0, startY + CHUNK_SIZE - height);

  const newGrid = Array(height + topPad + bottomPad)
    .fill(0)
    .map(() => Array(width + leftPad + rightPad).fill(0));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      newGrid[y + topPad][x + leftPad] = grid[y][x];
    }
  }

  const shiftX = Math.round(leftPad / CHUNK_SIZE);
  const shiftY = Math.round(topPad / CHUNK_SIZE);
  const shiftedOwners = shiftChunkOwners(owners, shiftX, shiftY);

  const ox = startX + leftPad;
  const oy = startY + topPad;

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      newGrid[oy + y][ox + x] = chunk[y][x];
    }
  }

  const chunkKey = makeChunkKey(
    Math.round(ox / CHUNK_SIZE),
    Math.round(oy / CHUNK_SIZE)
  );
  shiftedOwners[chunkKey] = ownerId;

  return { grid: newGrid, owners: shiftedOwners };
}

function buildChunkTiles(grid: number[][], cx: number, cy: number) {
  const tiles: number[] = [];
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const value = grid[startY + y]?.[startX + x];
      tiles.push(typeof value === "number" ? value : 0);
    }
  }

  return tiles;
}

function parseCoord(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function clampU8(value: number, max: number) {
  const clamped = Math.max(0, Math.min(max, value));
  return Number.isFinite(clamped) ? clamped : 0;
}

function extractObjectId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (record.id && typeof record.id === "object") {
    const nested = record.id as Record<string, unknown>;
    if (typeof nested.id === "string") return nested.id;
  }
  if (record.fields && typeof record.fields === "object") {
    const fields = record.fields as Record<string, unknown>;
    if (typeof fields.id === "string") return fields.id;
    if (fields.id && typeof fields.id === "object") {
      const nested = fields.id as Record<string, unknown>;
      if (typeof nested.id === "string") return nested.id;
    }
  }

  return "";
}

function shortAddress(value?: string) {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

/* ================= TILE BUTTON ================= */

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
      className={`tile-button ${active ? "tile-button--active" : ""}`}
      style={{ background: color }}
    >
      {label}
    </button>
  );
}
