import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * TILE CODE
 * 0 = empty
 * 1 = wall
 * 2 = trap
 * 3 = player spawn
 * 4 = enemy
 * 5 = floor
 */

const TILE_SIZE = 32;
const MAP_W = 20;
const MAP_H = 12;

const TILE_COLORS: Record<number, string> = {
  0: "#000",
  1: "#888",
  2: "#e53935",
  3: "#29b6f6",
  4: "#ff5050",
  5: "#546e7a",
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

    // chỉ cho 1 player spawn
    if (selectedTile === 3) {
      for (let j = 0; j < MAP_H; j++) {
        for (let i = 0; i < MAP_W; i++) {
          if (copy[j][i] === 3) copy[j][i] = 0;
        }
      }
    }

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
          label="Spawn"
          color={TILE_COLORS[3]}
          active={selectedTile === 3}
          onClick={() => setSelectedTile(3)}
        />
        <TileButton
          label="Enemy"
          color={TILE_COLORS[4]}
          active={selectedTile === 4}
          onClick={() => setSelectedTile(4)}
        />
        <TileButton
          label="Floor"
          color={TILE_COLORS[5]}
          active={selectedTile === 5}
          onClick={() => setSelectedTile(5)}
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
