import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

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

export default function EditorGame() {
  const navigate = useNavigate();
  const [selectedTile, setSelectedTile] = useState<number>(1);
  const [grid, setGrid] = useState<number[][]>(() => createDefaultGrid());

  useEffect(() => {
    loadMap();
  }, []);

  /* ================= MAP IO ================= */

  function saveMap() {
    const data = {
      tileSize: TILE_SIZE,
      width: grid[0].length,
      height: grid.length,
      grid,
    };
    localStorage.setItem("CUSTOM_MAP", JSON.stringify(data));
    alert("✅ Map saved!");
  }

  function loadMap() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);
      if (data.grid) setGrid(data.grid);
    } catch (e) {
      console.error(e);
    }
  }

  function clearMap() {
    if (confirm("Xóa toàn bộ map?")) {
      setGrid(createDefaultGrid());
    }
  }

  /* ================= EDIT ================= */

  function paint(x: number, y: number) {
    setGrid((prev) => {
      const copy = prev.map((r) => [...r]);
      copy[y][x] = selectedTile;
      return copy;
    });
  }

  /* ================= CHUNK LOGIC ================= */

  function addSingleChunk(dir: Direction) {
    setGrid((prev) => {
      const candidates = findAttachCandidates(prev, dir);
      if (candidates.length === 0) return prev;

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];

      const chunk = createChunk(DEFAULT_FLOOR);
      return mergeChunk(prev, chunk, chosen.x, chosen.y);
    });
  }

  const gridWidth = grid[0].length;

  /* ================= UI ================= */

  return (
    <div style={{ padding: 20 }}>
      <h2>🗺️ MAP EDITOR – Single 8×8 Chunk</h2>

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
        <button onClick={() => addSingleChunk("left")}>⬅ Add 8×8</button>
        <button onClick={() => addSingleChunk("right")}>➡ Add 8×8</button>
        <button onClick={() => addSingleChunk("top")}>⬆ Add 8×8</button>
        <button onClick={() => addSingleChunk("bottom")}>⬇ Add 8×8</button>
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
          row.map((cell, x) => (
            <div
              key={`${x}-${y}`}
              onClick={() => paint(x, y)}
              style={{
                width: TILE_SIZE,
                height: TILE_SIZE,
                background: TILE_COLORS[cell],
                border: "1px solid #333",
                cursor: "pointer",
              }}
            />
          ))
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
  chunk: number[][],
  startX: number,
  startY: number
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

  const ox = startX + leftPad;
  const oy = startY + topPad;

  // paste chunk
  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      newGrid[oy + y][ox + x] = chunk[y][x];
    }
  }

  return newGrid;
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
