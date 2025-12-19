import { useState, useEffect } from "react";
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
const MAP_W = 20;
const MAP_H = 12;

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

export default function EditorGame() {
  const navigate = useNavigate();

  const [selectedTile, setSelectedTile] = useState<number>(1);

  const [grid, setGrid] = useState<number[][]>(
    Array(MAP_H)
      .fill(0)
      .map(() => Array(MAP_W).fill(0))
  );

  useEffect(() => {
    loadMap();
  }, []);

  function loadMap() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return;

    try {
      const data = JSON.parse(raw);

      // Xử lý format cũ (tiles object)
      if (data.tiles && !data.grid) {
        const width = data.width || MAP_W;
        const height = data.height || MAP_H;
        const newGrid = Array(MAP_H)
          .fill(0)
          .map(() => Array(MAP_W).fill(0));

        for (const [key, value] of Object.entries(data.tiles)) {
          const [x, y] = key.split(",").map(Number);
          if (y < MAP_H && x < MAP_W) {
            newGrid[y][x] = value as number;
          }
        }

        setGrid(newGrid);
      }
      // Format mới (grid array)
      else if (data.grid) {
        setGrid(data.grid);
      }
    } catch (e) {
      console.error("Failed to load map:", e);
    }
  }

  function clearMap() {
    if (confirm("Xóa toàn bộ map?")) {
      setGrid(
        Array(MAP_H)
          .fill(0)
          .map(() => Array(MAP_W).fill(0))
      );
    }
  }

  function paint(x: number, y: number) {
    const copy = grid.map((row) => [...row]);
    copy[y][x] = selectedTile;
    setGrid(copy);
  }

  function saveMap() {
    const data = {
      tileSize: TILE_SIZE,
      width: MAP_W,
      height: MAP_H,
      grid,
    };

    localStorage.setItem("CUSTOM_MAP", JSON.stringify(data));
    alert("✅ Map saved!");
  }

  return (
    <div style={{ padding: 20, color: "#fff" }}>
      <h2>🗺️ MAP EDITOR</h2>

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
          label="Trap"
          color={TILE_COLORS[2]}
          active={selectedTile === 2}
          onClick={() => setSelectedTile(2)}
        />
        <TileButton
          label="Enemy"
          color={TILE_COLORS[4]}
          active={selectedTile === 4}
          onClick={() => setSelectedTile(4)}
        />
      </div>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${MAP_W}, ${TILE_SIZE}px)`,
          border: "2px solid #555",
          width: MAP_W * TILE_SIZE,
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
