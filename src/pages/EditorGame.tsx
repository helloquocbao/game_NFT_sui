import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ADMIN_CAP_ID,
  PACKAGE_ID,
  SUI_RPC_URL,
  WORLD_REGISTRY_ID,
} from "../chain/config";
import { suiClient } from "../chain/suiClient";

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
  0: "#000",
  1: "#888",
  2: "#e53935",
  4: "#ff5050",
  5: "#546e7a",
  6: "#607d8b",
  7: "#78909c",
  8: "#90a4ae",
};

type Direction = "left" | "right" | "top" | "bottom";
type ChunkOwners = Record<string, string>;

export default function EditorGame() {
  const navigate = useNavigate();
  const initialUserId = getOrCreateUserId();
  const [userId, setUserId] = useState(initialUserId);
  const [notice, setNotice] = useState<string>("");
  const [selectedTile, setSelectedTile] = useState<number>(1);
  const [grid, setGrid] = useState<number[][]>(() => createDefaultGrid());
  const [chunkOwners, setChunkOwners] = useState<ChunkOwners>(() =>
    createOwnersForGrid(createDefaultGrid(), initialUserId)
  );
  const [worldId, setWorldId] = useState<string>("");
  const [chainError, setChainError] = useState<string>("");

  useEffect(() => {
    loadMap();
  }, []);

  useEffect(() => {
    loadWorldId();
  }, [WORLD_REGISTRY_ID]);

  /* ================= MAP IO ================= */

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
      const id =
        Array.isArray(vec) && vec.length > 0 ? String(vec[0]) : "";
      setWorldId(id);
    } catch (err) {
      setChainError(err instanceof Error ? err.message : String(err));
      setWorldId("");
    }
  }

  function saveMap() {
    const data = {
      tileSize: TILE_SIZE,
      width: grid[0].length,
      height: grid.length,
      grid,
      chunkOwners,
    };
    localStorage.setItem(MAP_KEY, JSON.stringify(data));
    alert("✅ Map saved!");
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
    } catch (e) {
      console.error(e);
    }
  }

  function clearMap() {
    if (confirm("Xóa toàn bộ map?")) {
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
      const copy = prev.map((r) => [...r]);
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

  const gridWidth = grid[0].length;

  /* ================= UI ================= */

  return (
    <div style={{ padding: 20 }}>
      <h2>🗺️ MAP EDITOR – Single 8×8 Chunk</h2>

      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 12,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <div>User: {userId}</div>
        <button onClick={changeUser}>Switch User</button>
        {notice && <div style={{ color: "#ffcc80" }}>{notice}</div>}
      </div>

      {/* CHAIN INFO */}
      <div
        style={{
          marginBottom: 12,
          padding: 10,
          border: "1px solid #555",
          background: "#111",
          color: "#ddd",
        }}
      >
        <div>Chain RPC: {SUI_RPC_URL}</div>
        <div>Package: {PACKAGE_ID || "missing"}</div>
        <div>AdminCap: {ADMIN_CAP_ID || "missing"}</div>
        <div>WorldRegistry: {WORLD_REGISTRY_ID || "missing"}</div>
        <div>WorldId: {worldId || "not created"}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={loadWorldId}>Refresh World</button>
        </div>
        {chainError && <div style={{ color: "#ff8a80" }}>{chainError}</div>}
      </div>

      {/* TILE TOOLBAR */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
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

      {/* CHUNK BUTTONS */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={addRandomChunk}>Random Add 8x8</button>
      </div>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridWidth}, ${TILE_SIZE}px)`,
          border: "2px solid #555",
          width: gridWidth * TILE_SIZE,
        }}
      >
        {grid.map((row, y) =>
          row.map((cell, x) => {
            const chunkKey = getChunkKeyFromTile(x, y);
            const owner = chunkOwners[chunkKey];
            const canEdit = owner === userId;

            return (
              <div
                key={`${x}-${y}`}
                onClick={() => paint(x, y)}
                title={`Owner: ${owner ?? "none"}`}
                style={{
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  background: TILE_COLORS[cell],
                  border: "1px solid #333",
                  cursor: canEdit ? "pointer" : "not-allowed",
                }}
              />
            );
          })
        )}
      </div>

      {/* ACTION */}
      <div style={{ marginTop: 16, display: "flex", gap: 10 }}>
        <button onClick={saveMap}>💾 Save</button>
        <button onClick={loadMap}>📂 Load</button>
        <button onClick={clearMap}>🗑️ Clear</button>
        <button onClick={() => navigate("/game")}>▶ Play</button>
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

function shiftChunkOwners(
  owners: ChunkOwners,
  shiftX: number,
  shiftY: number
) {
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

      // ngoài map → coi như empty (sẽ pad)
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
        chunk[y][x] = 0; // carve
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

  // copy old grid
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

  // paste chunk
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
      style={{
        padding: "6px 10px",
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
