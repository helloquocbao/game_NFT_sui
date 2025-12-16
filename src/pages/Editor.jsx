import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import kaboom from "kaboom";

import {
  Play,
  Edit3,
  Box,
  CircleDollarSign,
  User,
  Eraser,
  Palette,
  MousePointer2,
  Grid,
  Download,
  Ghost,
  Flame,
  ZoomIn,
  ZoomOut,
  Search,
  Hand,
  Trophy,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import {
  fetchDungeonById,
  readDungeonMap,
  validateMapJsonSchema,
} from "../services/dungeonService";
import dataLocal from "../services/dataLocal.json";

// --- CẤU HÌNH BAN ĐẦU ---

const BASE_TILE_SIZE = 32;

// KÍCH THƯỚC KHUNG HÌNH CAMERA (VIEWPORT) CỐ ĐỊNH KHI CHƠI

const VIEWPORT_WIDTH = 20; // 20 ô ngang

const VIEWPORT_HEIGHT = 12; // 12 ô dọc

// Danh sách công cụ

const TOOLS = [
  { id: "1", char: "1", label: "WALL TYPE 1", type: "WALL" },

  { id: "2", char: "2", label: "WALL TYPE 2", type: "WALL" },

  { id: "3", char: "3", label: "WALL TYPE 3", type: "WALL" },

  {
    id: "TRAP",
    char: "^",
    label: "TRAP (SPIKE)",
    type: "OBJ",
    icon: Flame,
    color: "#ef4444",
  },

  {
    id: "ENEMY",
    char: "E",
    label: "MONSTER",
    type: "OBJ",
    icon: Ghost,
    color: "#a855f7",
  },

  {
    id: "PLAYER",
    char: "@",
    label: "PLAYER",
    type: "OBJ",
    icon: User,
    color: "#3b82f6",
  },

  {
    id: "COIN",
    char: "$",
    label: "TREASURE",
    type: "OBJ",
    icon: CircleDollarSign,
    color: "#eab308",
  },

  {
    id: "EMPTY",
    char: " ",
    label: "ERASER",
    type: "TOOL",
    icon: Eraser,
    color: "#94a3b8",
  },
];

const DEFAULT_WALLS = {
  1: { color: "#f97316" },
  2: { color: "#64748b" },
  3: { color: "#78350f" },
};

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [wallConfigs, setWallConfigs] = useState(DEFAULT_WALLS);

  const [mapSize, setMapSize] = useState({ width: 20, height: 12 });

  const [mapData, setMapData] = useState(
    Array(12)
      .fill()
      .map(() => Array(20).fill(" "))
  );

  const [loadingMap, setLoadingMap] = useState(false);

  const [mode, setMode] = useState("EDIT");

  const [selectedToolId, setSelectedToolId] = useState("1");

  const [zoom, setZoom] = useState(1.0);

  const [isZoomMode, setIsZoomMode] = useState(false);
  const [mintStatus, setMintStatus] = useState("");
  const [dungeonName, setDungeonName] = useState("Walrus Dungeon Map");
  const [toast, setToast] = useState(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [winScore, setWinScore] = useState({ collected: 0, total: 0 });
  // mặc định false, nhưng sẽ auto-activate 1 lần sau khi load xong
  const [isGameFocused, setIsGameFocused] = useState(false);
  const isGameFocusedRef = useRef(false);

  // đảm bảo auto-activate chỉ chạy 1 lần cho mỗi lần vào PLAY mode
  const hasAutoActivatedRef = useRef(false);

  const scrollContainerRef = useRef(null);

  const isDragging = useRef(false);

  const dragStart = useRef({ x: 0, y: 0, left: 0, top: 0 });

  const gameContainerRef = useRef(null);
  const kaboomInstanceRef = useRef(null);
  const gameWrapperRef = useRef(null);

  const editorGridRef = useRef(null);

  // Helper để kiểm tra element có thuộc "safe zone" (UI) không
  const shouldIgnoreBlur = useCallback((target) => {
    return !!target?.closest?.('[data-ui="1"]');
  }, []);

  const focusGameCanvas = useCallback(() => {
    const root = gameContainerRef.current;
    if (!root) return;

    const canvas = root.querySelector("canvas");
    if (!canvas) return;

    if (!canvas.hasAttribute("tabindex")) canvas.setAttribute("tabindex", "0");

    try {
      canvas.focus({ preventScroll: true });
    } catch {
      canvas.focus();
    }
  }, []);

  const activateGame = useCallback(() => {
    setIsGameFocused(true);
    isGameFocusedRef.current = true;

    // overlay unmount xong mới focus
    requestAnimationFrame(() => {
      focusGameCanvas();
    });
  }, [focusGameCanvas]);

  // Reset auto-activate khi chuyển mode
  useEffect(() => {
    if (mode === "PLAY") {
      hasAutoActivatedRef.current = false;
      setIsGameFocused(false);
      isGameFocusedRef.current = false;
    }
  }, [mode]);

  // AUTO PLAY: khi chuyển sang PLAY mode và game sẵn sàng -> tự focus để chơi liền
  useEffect(() => {
    if (mode !== "PLAY") return;
    if (hasAutoActivatedRef.current) return;
    if (showWinModal) return;
    if (!gameContainerRef.current) return;

    // Đợi một chút để kaboom init xong
    const timer = setTimeout(() => {
      hasAutoActivatedRef.current = true;
      activateGame();
    }, 100);

    return () => clearTimeout(timer);
  }, [mode, showWinModal, activateGame]);

  const [unAuthorized, setUnAuthorized] = useState(false);

  // Nạp dữ liệu map (từ on-chain hoặc dataLocal.json)
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingMap(true);
      setUnAuthorized(false);
      try {
        // Tạo artificial delay để user thấy loading state rõ hơn (UX)
        await new Promise((resolve) => setTimeout(resolve, 500));
        if (!active) return;

        let mapJson = null;

        // Nếu không có id hoặc load fail, dùng dataLocal.json
        if (!mapJson) {
          console.log("Loading from dataLocal.json");
          mapJson = dataLocal;
        }

        // Get actual dimensions from layout
        const actualHeight = mapJson.layout.length;
        const actualWidth = Math.max(
          ...mapJson.layout.map((row) => row.length)
        );

        setMapSize({
          width: actualWidth,
          height: actualHeight,
        });
        console.log(mapJson);
        // Convert "." to space and ensure all rows have same width
        setMapData(
          mapJson.layout.map((row) => {
            const converted = row.replace(/\./g, " "); // Convert dot to space
            const chars = converted.split("");
            // Pad with spaces if needed
            while (chars.length < actualWidth) chars.push(" ");
            return chars;
          })
        );

        const nextWalls = { ...DEFAULT_WALLS };
        Object.entries(mapJson.assets || {}).forEach(([key, asset]) => {
          if (["1", "2", "3"].includes(key) && asset.type === "color") {
            nextWalls[key] = {
              color: asset.value,
            };
          }
        });
        setWallConfigs(nextWalls);
        if (mapJson?.meta?.title) {
          setDungeonName(mapJson.meta.title);
        }
        setMode("EDIT");
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoadingMap(false);
      }
    };
    load();

    return () => {
      active = false;
    };
  }, [id]);

  const currentTool = TOOLS.find((t) => t.id === selectedToolId) || TOOLS[0];

  // --- XỬ LÝ ZOOM WHEEL ---

  useEffect(() => {
    const containerEl = scrollContainerRef.current;

    if (!containerEl) return;

    const handleWheel = (e) => {
      // Chỉ zoom khi đang bật chế độ Zoom

      if (mode === "EDIT" && isZoomMode) {
        e.preventDefault();

        const delta = e.deltaY > 0 ? -0.1 : 0.1;

        setZoom((prev) => Math.min(Math.max(prev + delta, 0.2), 3.0));
      }
    };

    containerEl.addEventListener("wheel", handleWheel, { passive: false });

    return () => containerEl.removeEventListener("wheel", handleWheel);
  }, [isZoomMode, mode]);

  const handleZoomChange = (delta) => {
    setZoom((prev) => Math.min(Math.max(prev + delta, 0.2), 3.0));
  };

  // --- XỬ LÝ KÉO THẢ (DRAG TO PAN) ---

  const handleMouseDown = (e) => {
    // ĐIỀU KIỆN NGHIÊM NGẶT: Phải mode EDIT và đang bật ZOOM

    if (mode !== "EDIT" || !isZoomMode) return;

    e.preventDefault();

    isDragging.current = true;

    const container = scrollContainerRef.current;

    if (container) {
      dragStart.current = {
        x: e.pageX,

        y: e.pageY,

        left: container.scrollLeft,

        top: container.scrollTop,
      };

      container.style.cursor = "grabbing";
    }
  };

  const handleMouseMove = (e) => {
    if (!isDragging.current) return;

    e.preventDefault();

    const container = scrollContainerRef.current;

    if (container) {
      const dx = e.pageX - dragStart.current.x;

      const dy = e.pageY - dragStart.current.y;

      container.scrollLeft = dragStart.current.left - dx;

      container.scrollTop = dragStart.current.top - dy;
    }
  };

  const handleMouseUp = () => {
    if (isDragging.current) {
      isDragging.current = false;

      if (scrollContainerRef.current) {
        scrollContainerRef.current.style.cursor = isZoomMode
          ? "grab"
          : "default";
      }
    }
  };

  useEffect(() => {
    if (scrollContainerRef.current) {
      // Reset cursor dựa trên mode

      if (mode === "EDIT" && isZoomMode) {
        scrollContainerRef.current.style.cursor = "grab";
      } else {
        scrollContainerRef.current.style.cursor = "default";
      }
    }
  }, [isZoomMode, mode]);

  // Center map khi mới load EDITOR

  useEffect(() => {
    if (mode === "EDIT" && scrollContainerRef.current) {
      const container = scrollContainerRef.current;

      container.scrollLeft = (2000 - container.clientWidth) / 2;

      container.scrollTop = (2000 - container.clientHeight) / 2;
    }
  }, [mode]); // Chạy lại khi chuyển sang mode EDIT

  const handleResize = (dWidth, dHeight) => {
    const newW = mapSize.width + dWidth;

    const newH = mapSize.height + dHeight;

    if (newW < 5 || newW > 100 || newH < 5 || newH > 100) return;

    const newMap = Array(newH)
      .fill()
      .map((_, r) =>
        Array(newW)
          .fill()
          .map((_, c) => {
            if (mapData[r] && mapData[r][c]) return mapData[r][c];

            return " ";
          })
      );

    setMapSize({ width: newW, height: newH });

    setMapData(newMap);
  };

  const handleCellClick = (rowIndex, colIndex) => {
    if (isZoomMode) return;

    const newMap = [...mapData];

    if (!newMap[rowIndex]) return;

    if (currentTool.id === "PLAYER") {
      for (let r = 0; r < mapSize.height; r++) {
        for (let c = 0; c < mapSize.width; c++) {
          if (newMap[r] && newMap[r][c] === "@") newMap[r][c] = " ";
        }
      }
    }

    newMap[rowIndex][colIndex] = currentTool.char;

    setMapData(newMap);
  };

  // Hiển thị toast message
  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Validate map trước khi PLAY hoặc Export
  const validateMap = () => {
    const flat = mapData.flat();
    const allowedChars = new Set([
      ...Object.keys(wallConfigs),
      "@",
      "$",
      "E",
      "^",
      " ",
    ]);

    // Ít nhất 1 player
    const playerCount = flat.filter((c) => c === "@").length;
    if (playerCount !== 1) {
      showToast("Map must have exactly 1 player (@).");
      return false;
    }

    // Ít nhất 1 kho báu
    const coinCount = flat.filter((c) => c === "$").length;
    if (coinCount < 1) {
      showToast("Map must have at least 1 treasure ($).");
      return false;
    }

    // Không toàn ô trống
    if (flat.every((c) => c === " ")) {
      showToast("Map cannot be empty.");
      return false;
    }

    // Kiểm tra legend (chỉ ký tự cho phép)
    const hasIllegal = flat.some((c) => !allowedChars.has(c));
    if (hasIllegal) {
      showToast("Map contains invalid characters.");
      return false;
    }

    // Giới hạn kích thước
    if (mapSize.width > 300 || mapSize.height > 100) {
      showToast("Size limit exceeded (300x100).");
      return false;
    }

    return true;
  };

  const updateWallConfig = (wallId, field, value) => {
    setWallConfigs((prev) => ({
      ...prev,

      [wallId]: { ...prev[wallId], [field]: value },
    }));
  };

  const buildMapPayload = () => {
    const assetsExport = {};

    Object.keys(wallConfigs).forEach((key) => {
      const conf = wallConfigs[key];

      assetsExport[key] = {
        type: "color",
        value: conf.color,
      };
    });

    return {
      meta: {
        title: dungeonName || "Walrus Dungeon Map",
        created: new Date().toISOString(),
        engine: "Kaboom.js",
        version: "2.0",
      },
      config: {
        width: mapSize.width,
        height: mapSize.height,
        tileSize: BASE_TILE_SIZE,
      },
      assets: assetsExport,
      layout: mapData.map((row) => row.join("")),
    };
  };

  // Save to dataLocal.json (download file)
  const handleSaveToLocal = () => {
    if (!validateMap()) return;

    try {
      const mapJson = buildMapPayload();
      const jsonString = JSON.stringify(mapJson, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dataLocal.json";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast("Map saved to dataLocal.json!", "success");
    } catch (err) {
      console.error(err);
      showToast(err.message);
    }
  };

  const handleSaveAndMint = async () => {
    if (!validateMap()) return;
    try {
      setMintStatus("Generating thumbnail...");
      const mapJson = buildMapPayload();
      const thumbnail = await captureThumbnail();
      if (!thumbnail) throw new Error("Failed to capture thumbnail");

      setMintStatus("Uploading to Walrus (Batch)...");

      // Combined upload
      console.log("Uploading map and thumbnail...", mapJson, thumbnail);

      // Tạo image URL từ patchId

      setMintStatus("Minting on Sui testnet...");

      setMintStatus(`Mint success:`);
      showToast(`Mint success!`, "success");
    } catch (err) {
      console.error(err);
      setMintStatus(`Error: ${err.message}`);
      showToast(err.message);
    }
  };

  const captureThumbnail = async () => {
    const thumbTile = 16;
    const canvas = document.createElement("canvas");
    canvas.width = mapSize.width * thumbTile;
    canvas.height = mapSize.height * thumbTile;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#fff7ed";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const drawCell = (r, c, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(c * thumbTile, r * thumbTile, thumbTile, thumbTile);
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 1;
      ctx.strokeRect(c * thumbTile, r * thumbTile, thumbTile, thumbTile);
    };

    mapData.forEach((row, r) => {
      row.forEach((cell, c) => {
        const wallConf = wallConfigs[cell];
        if (wallConf) {
          drawCell(r, c, wallConf.color || "#cbd5e1");
        } else if (cell === "@") {
          drawCell(r, c, "#3b82f6");
        } else if (cell === "$") {
          drawCell(r, c, "#eab308");
        } else if (cell === "E") {
          drawCell(r, c, "#a855f7");
        } else if (cell === "^") {
          drawCell(r, c, "#ef4444");
        }
      });
    });

    return new Promise((resolve) =>
      canvas.toBlob((blob) => resolve(blob), "image/png")
    );
  };

  useEffect(() => {
    let k;

    let isCleanedUp = false;

    if (mode === "PLAY" && gameContainerRef.current) {
      if (gameContainerRef.current.innerHTML !== "")
        gameContainerRef.current.innerHTML = "";

      try {
        k = kaboom({
          width: VIEWPORT_WIDTH * BASE_TILE_SIZE,

          height: VIEWPORT_HEIGHT * BASE_TILE_SIZE,

          scale: 1,

          root: gameContainerRef.current,

          global: false,

          background: [255, 247, 237],
        });

        kaboomInstanceRef.current = k;
        k.setGravity(1600);

        function patrol(speed = 60, dir = 1) {
          return {
            id: "patrol",
            require: ["pos", "area"],

            add() {
              this.on("collide", (obj, col) => {
                if (col.isLeft() || col.isRight()) {
                  dir = -dir;
                }
              });
            },

            update() {
              this.move(speed * dir, 0);
            },
          };
        }

        Promise.resolve().then(() => {
          if (isCleanedUp) return;

          const tilesDef = {};

          Object.keys(wallConfigs).forEach((key) => {
            const conf = wallConfigs[key];

            tilesDef[key] = () => {
              const comps = [
                k.area(),
                k.body({ isStatic: true }),
                `wall_${key}`,
                "wall",
              ];

              // Tường chỉ dùng màu
              comps.push(k.rect(BASE_TILE_SIZE, BASE_TILE_SIZE));
              comps.push(k.color(k.Color.fromHex(conf.color)));
              comps.push(k.outline(2, k.BLACK));

              return comps;
            };
          });

          tilesDef["$"] = () => [
            k.circle(10),
            k.color(234, 179, 8),
            k.outline(2, k.BLACK),
            k.area(),
            k.pos(16, 16),
            "coin",
          ];

          tilesDef["@"] = () => [
            k.rect(24, 24),
            k.color(59, 130, 246),
            k.outline(2, k.BLACK),
            k.area(),
            k.body(),
            k.anchor("center"),
            k.pos(16, 16),
            "player",
          ];

          tilesDef["E"] = () => [
            k.rect(24, 24),
            k.color(168, 85, 247),
            k.outline(2, k.BLACK),
            k.area(),
            k.body(),
            k.anchor("center"),
            k.pos(16, 16),
            patrol(),
            "enemy",
            "danger",
          ];

          tilesDef["^"] = () => [
            k.polygon([k.vec2(0, 32), k.vec2(16, 0), k.vec2(32, 32)]),
            k.color(239, 68, 68),
            k.outline(2, k.BLACK),
            k.area(),
            k.body({ isStatic: true }),
            "trap",
            "danger",
          ];

          const levelConfig = {
            tileWidth: BASE_TILE_SIZE,
            tileHeight: BASE_TILE_SIZE,
            tiles: tilesDef,
          };

          k.scene("main", () => {
            const levelMap = mapData.map((row) => row.join(""));

            const level = k.addLevel(levelMap, levelConfig);

            const players = level.get("player");

            // Đếm tổng số coin ban đầu
            const totalCoins = mapData.flat().filter((c) => c === "$").length;
            let collectedCoins = 0;
            let isWon = false;

            if (players.length > 0) {
              const player = players[0];

              const SPEED = 200;

              const JUMP_FORCE = 600;

              k.camPos(player.pos);

              player.onUpdate(() => {
                if (isWon) return; // Dừng update khi đã win
                k.camPos(player.pos);

                if (player.pos.y > mapSize.height * BASE_TILE_SIZE + 200) {
                  k.shake(20);

                  k.go("main");
                }
              });

              k.onKeyDown("left", () => {
                if (!isWon && isGameFocusedRef.current) player.move(-SPEED, 0);
              });

              k.onKeyDown("right", () => {
                if (!isWon && isGameFocusedRef.current) player.move(SPEED, 0);
              });

              const jump = () => {
                if (!isWon && isGameFocusedRef.current && player.isGrounded())
                  player.jump(JUMP_FORCE);
              };

              k.onKeyPress("up", jump);

              k.onKeyPress("space", jump);

              player.onCollide("coin", (c) => {
                if (isWon) return;
                k.destroy(c);
                k.shake(2);
                collectedCoins++;

                // Kiểm tra win condition
                if (collectedCoins >= totalCoins) {
                  isWon = true;
                  k.shake(10);
                  k.addKaboom(player.pos);

                  // Hiển thị win modal
                  setWinScore({ collected: collectedCoins, total: totalCoins });
                  setShowWinModal(true);

                  setIsGameFocused(false);
                  isGameFocusedRef.current = false;
                }
              });

              player.onCollide("danger", () => {
                k.shake(20);
                k.addKaboom(player.pos);
                k.destroy(player);
                k.wait(1, () => k.go("main"));
              });
            }
          });

          k.go("main");

          // nếu đang focused thì focus canvas ngay sau khi scene ready
          if (isGameFocusedRef.current) {
            requestAnimationFrame(() => focusGameCanvas());
          }
        });
      } catch (err) {
        console.error(err);
      }
    }

    return () => {
      isCleanedUp = true;
      if (k && k.quit) k.quit();
    };
  }, [mode, mapData, mapSize, wallConfigs, focusGameCanvas]);

  // Click outside: blur game (Editor PLAY mode)
  useEffect(() => {
    if (mode !== "PLAY") {
      // Reset focus khi không phải PLAY mode
      setIsGameFocused(false);
      isGameFocusedRef.current = false;
      return;
    }

    const handlePointerDownOutside = (event) => {
      // Bỏ qua khi click vào UI (safe zone)
      if (shouldIgnoreBlur(event.target)) return;

      if (
        gameWrapperRef.current &&
        !gameWrapperRef.current.contains(event.target)
      ) {
        setIsGameFocused(false);
        isGameFocusedRef.current = false;
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutside, true);
    return () => {
      document.removeEventListener(
        "pointerdown",
        handlePointerDownOutside,
        true
      );
    };
  }, [mode, shouldIgnoreBlur]);

  // Sync ref with state (và focus lại canvas nếu state chuyển true)
  useEffect(() => {
    isGameFocusedRef.current = isGameFocused;
    if (isGameFocused) requestAnimationFrame(() => focusGameCanvas());
  }, [isGameFocused, focusGameCanvas]);

  const RetroButton = ({
    onClick,
    onPointerDown,
    active,
    children,
    className,
    disabled,
  }) => (
    <button
      onClick={onClick}
      onPointerDown={onPointerDown}
      disabled={disabled}
      className={`relative px-4 py-2 font-mono font-bold text-sm uppercase transition-all border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:translate-x-[2px] disabled:translate-y-[2px] ${
        active ? "text-white" : "text-slate-900 hover:opacity-80"
      } ${className}`}
    >
      {children}
    </button>
  );

  const RetroIconButton = ({ onClick, children, className }) => (
    <button
      onClick={onClick}
      className={`p-1 border-2 border-slate-900 bg-white hover:bg-orange-100 transition-colors ${className}`}
    >
      {children}
    </button>
  );

  const currentTileSize = BASE_TILE_SIZE * zoom;

  if (unAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-orange-50 text-slate-900 font-mono">
        <div className="bg-white p-8 border-4 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] max-w-md text-center">
          <h2 className="text-2xl font-black mb-4 text-red-500">
            UNAUTHORIZED
          </h2>
          <p className="mb-6 font-medium">
            You are not the owner of this NFT Dungeon content.
          </p>
          <RetroButton
            onClick={() => navigate("/")}
            className="w-full bg-slate-900 text-white hover:bg-slate-700"
          >
            RETURN TO HOME
          </RetroButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-orange-50 text-slate-900 font-mono overflow-hidden">
      <div className="fixed top-0 left-0 right-0 z-40"></div>
      <style>{`

        .hide-scrollbar::-webkit-scrollbar { display: none; }

        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

      `}</style>

      {/* SIDEBAR */}

      <div
        className={`w-80 bg-white border-r-4 border-slate-900 flex flex-col shadow-xl z-10 overflow-y-auto mt-14 transition-all duration-300 relative ${
          mode === "PLAY" ? "opacity-50 grayscale" : ""
        }`}
      >
        {mode === "PLAY" && (
          <div className="absolute inset-0 z-50 bg-white/20 cursor-not-allowed" />
        )}
        <div className="p-6 border-b-4 border-slate-900 bg-orange-100">
          <h1 className="text-2xl font-black tracking-tighter text-orange-600 drop-shadow-sm flex items-center gap-2">
            <Box strokeWidth={3} /> WALRUS{" "}
            <span className="text-slate-900">DUNGEON</span>
          </h1>

          <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">
            Walrus Dungeon Editor
          </p>
        </div>

        <div className="p-6 border-b-4 border-slate-900 border-dashed">
          <h3 className="text-sm font-bold uppercase mb-4 flex items-center gap-2">
            <Grid size={16} strokeWidth={3} /> Map Size
          </h3>

          <div className="flex gap-4">
            <div className="flex-1">
              <div className="text-xs font-bold mb-1 text-center text-slate-500">
                WIDTH: {mapSize.width}
              </div>

              <div className="flex items-center justify-between border-2 border-slate-900 bg-slate-100 p-1">
                <RetroIconButton
                  onClick={() => handleResize(-1, 0)}
                  className="w-8 h-8"
                >
                  -
                </RetroIconButton>

                <RetroIconButton
                  onClick={() => handleResize(1, 0)}
                  className="w-8 h-8"
                >
                  +
                </RetroIconButton>
              </div>
            </div>

            <div className="flex-1">
              <div className="text-xs font-bold mb-1 text-center text-slate-500">
                HEIGHT: {mapSize.height}
              </div>

              <div className="flex items-center justify-between border-2 border-slate-900 bg-slate-100 p-1">
                <RetroIconButton
                  onClick={() => handleResize(0, -1)}
                  className="w-8 h-8"
                >
                  -
                </RetroIconButton>

                <RetroIconButton
                  onClick={() => handleResize(0, 1)}
                  className="w-8 h-8"
                >
                  +
                </RetroIconButton>
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 border-b-4 border-slate-900 border-dashed">
          <h3 className="text-sm font-bold uppercase mb-4 flex items-center gap-2">
            <Edit3 size={16} strokeWidth={3} /> NFT Name
          </h3>
          <input
            type="text"
            value={dungeonName}
            onChange={(e) => setDungeonName(e.target.value)}
            disabled={mode === "PLAY"}
            placeholder="Enter NFT name..."
            className="w-full text-sm font-mono border-2 border-slate-900 p-2 focus:border-orange-500 focus:outline-none bg-white shadow-[2px_2px_0px_0px_rgba(15,23,42,0.2)] disabled:bg-slate-100 disabled:text-slate-500"
          />
          <p className="text-xs text-slate-500 mt-2">
            This name will be saved to NFT metadata
          </p>
        </div>

        <div className="p-6 flex-1 bg-slate-50">
          <h3 className="text-sm font-bold uppercase mb-4 flex items-center gap-2">
            <MousePointer2 size={16} strokeWidth={3} /> Drawing Tools
          </h3>

          <div className="flex flex-col gap-3">
            {TOOLS.map((tool) => {
              const isSelected = selectedToolId === tool.id;

              const isWall = tool.type === "WALL";

              return (
                <div
                  key={tool.id}
                  className={`transition-all ${
                    isSelected ? "translate-x-2" : ""
                  }`}
                >
                  <button
                    onClick={() => setSelectedToolId(tool.id)}
                    className={`w-full flex items-center gap-4 p-3 text-left border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,0.2)] hover:shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] hover:translate-x-[2px] hover:translate-y-[2px] transition-all ${
                      isSelected
                        ? "bg-orange-500 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] translate-y-[2px]"
                        : "bg-white text-slate-900"
                    }`}
                  >
                    <div
                      className="w-10 h-10 border-2 border-slate-900 flex items-center justify-center shrink-0 bg-white"
                      style={{
                        backgroundColor: isWall
                          ? wallConfigs[tool.id].color
                          : tool.color || "white",
                      }}
                    >
                      {!isWall && tool.icon && (
                        <tool.icon
                          size={20}
                          className={`relative z-10 ${
                            isSelected ? "text-white" : "text-slate-900"
                          }`}
                          strokeWidth={2.5}
                        />
                      )}
                    </div>

                    <span className="text-sm font-bold tracking-tight">
                      {tool.label}
                    </span>
                  </button>

                  {isWall && isSelected && (
                    <div className="mt-2 ml-4 p-3 border-l-4 border-slate-900 bg-white shadow-sm animate-in slide-in-from-left-2">
                      <div className="flex items-center gap-2 border-2 border-slate-200 p-1 bg-slate-100">
                        <Palette size={16} className="text-slate-500" />
                        <input
                          type="color"
                          value={wallConfigs[tool.id].color}
                          onChange={(e) =>
                            updateWallConfig(tool.id, "color", e.target.value)
                          }
                          className="bg-transparent w-full h-8 cursor-pointer"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* MAIN AREA - TÁCH BIỆT HOÀN TOÀN EDITOR VÀ PLAYER */}

      <div className="flex-1 relative flex flex-col overflow-hidden mt-14">
        {/* TOP BAR (Luôn hiển thị) */}

        <div
          className="absolute top-6 left-6 right-6 z-50 flex justify-between items-center"
          data-ui="1"
        >
          <RetroButton
            onClick={() => navigate("/")}
            className="bg-slate-700 hover:bg-slate-600 text-white flex items-center gap-2"
          >
            <ArrowLeft size={18} strokeWidth={3} /> HOME
          </RetroButton>

          <div className="flex gap-4 items-center">
            {mode === "EDIT" ? (
              <>
                <RetroButton
                  onClick={() => {
                    if (validateMap()) setMode("PLAY");
                  }}
                  className="bg-green-500 hover:bg-green-400 text-white flex items-center gap-2"
                >
                  <Play size={18} fill="currentColor" strokeWidth={3} /> PLAY
                  TEST
                </RetroButton>

                <div className="flex gap-2">
                  <RetroButton
                    onClick={handleSaveToLocal}
                    className="bg-purple-500 hover:bg-purple-400 text-white flex items-center gap-2"
                  >
                    <Download size={18} strokeWidth={3} /> SAVE LOCAL
                  </RetroButton>
                  <RetroButton
                    onClick={handleSaveAndMint}
                    className="bg-pink-500 hover:bg-pink-400 text-white flex items-center gap-2"
                  >
                    {"SAVE & MINT"}
                  </RetroButton>
                </div>
              </>
            ) : (
              <RetroButton
                onClick={(e) => {
                  e.stopPropagation();
                  setMode("EDIT");
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setMode("EDIT");
                }}
                className="bg-yellow-500 hover:bg-yellow-400 text-white flex items-center gap-2"
              >
                <Edit3 size={18} strokeWidth={3} /> EDIT MAP
              </RetroButton>
            )}
          </div>
        </div>

        {mintStatus && (
          <div className="absolute top-14 left-6 z-50 bg-white border-2 border-slate-900 px-3 py-2 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.6)] text-xs font-mono">
            {mintStatus}
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed top-20 right-6 z-50 px-4 py-3 border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] font-bold text-sm transition-all animate-in slide-in-from-right ${
              toast.type === "success"
                ? "bg-green-500 text-white"
                : "bg-red-500 text-white"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Loading Overlay */}
        {loadingMap && (
          <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-orange-500 mb-4"></div>
            <p className="text-lg font-bold text-slate-700 animate-pulse">
              Loading map data...
            </p>
          </div>
        )}

        {/* --- KHÔNG GIAN EDIT (INFINITE CANVAS) --- */}

        {mode === "EDIT" && (
          <>
            <div
              ref={scrollContainerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className="w-full h-full bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] bg-orange-50 overflow-auto hide-scrollbar cursor-crosshair transition-colors"
            >
              <div className="flex items-center justify-center min-w-[2000px] min-h-[2000px] p-20">
                <div
                  ref={editorGridRef}
                  className={`bg-white p-2 border-4 border-slate-900 shadow-[20px_20px_0px_0px_rgba(15,23,42,0.2)] transition-transform duration-100 origin-center ${
                    isZoomMode ? "" : "cursor-crosshair"
                  }`}
                >
                  <div
                    style={{
                      display: "grid",

                      gridTemplateColumns: `repeat(${mapSize.width}, ${currentTileSize}px)`,

                      gridTemplateRows: `repeat(${mapSize.height}, ${currentTileSize}px)`,

                      width: mapSize.width * currentTileSize,

                      height: mapSize.height * currentTileSize,
                    }}
                  >
                    {mapData.map((row, rIndex) =>
                      row.map((cellChar, cIndex) => {
                        let bgStyle = { backgroundColor: "white" };

                        let icon = null;

                        const wallConfig = wallConfigs[cellChar];

                        if (wallConfig) {
                          bgStyle = { backgroundColor: wallConfig.color };
                        } else if (cellChar === "@")
                          icon = (
                            <User
                              size={24 * zoom}
                              className="text-blue-600 drop-shadow-md"
                              strokeWidth={3}
                            />
                          );
                        else if (cellChar === "$")
                          icon = (
                            <CircleDollarSign
                              size={24 * zoom}
                              className="text-yellow-500 drop-shadow-md"
                              strokeWidth={3}
                            />
                          );
                        else if (cellChar === "E")
                          icon = (
                            <Ghost
                              size={24 * zoom}
                              className="text-purple-500 drop-shadow-md"
                              strokeWidth={3}
                            />
                          );
                        else if (cellChar === "^")
                          icon = (
                            <Flame
                              size={24 * zoom}
                              className="text-red-500 drop-shadow-md"
                              strokeWidth={3}
                            />
                          );

                        return (
                          <div
                            key={`${rIndex}-${cIndex}`}
                            onMouseDown={() => handleCellClick(rIndex, cIndex)}
                            onMouseEnter={(e) => {
                              if (e.buttons === 1)
                                handleCellClick(rIndex, cIndex);
                            }}
                            className="border-r border-b border-slate-200 hover:border-orange-500 hover:border-2 hover:z-10 flex items-center justify-center select-none relative group"
                            style={bgStyle}
                          >
                            {cellChar === " " && (
                              <div
                                className="bg-slate-200 rounded-full"
                                style={{ width: 4 * zoom, height: 4 * zoom }}
                              ></div>
                            )}

                            {icon}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ZOOM CONTROLS (Chỉ hiện ở EDIT) */}

            <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-2 items-end">
              <div className="bg-white border-2 border-slate-900 p-1 flex gap-1 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                <button
                  onClick={() => setIsZoomMode(!isZoomMode)}
                  className={`p-2 border-2 border-slate-900 font-bold text-xs flex items-center gap-2 transition-all ${
                    isZoomMode
                      ? "bg-red-500 text-white"
                      : "bg-slate-200 text-slate-700 hover:bg-white"
                  }`}
                >
                  {isZoomMode ? (
                    <Hand size={16} strokeWidth={3} />
                  ) : (
                    <Search size={16} strokeWidth={3} />
                  )}

                  {isZoomMode ? "MODE: DRAG/ZOOM" : "MODE: DRAW"}
                </button>
              </div>

              <div className="bg-white border-2 border-slate-900 p-1 flex gap-1 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)]">
                <RetroIconButton
                  onClick={() => handleZoomChange(-0.1)}
                  className="w-10 h-10"
                >
                  <ZoomOut size={20} />
                </RetroIconButton>

                <div className="w-12 h-10 flex items-center justify-center font-bold border-2 border-slate-900 bg-slate-50">
                  {Math.round(zoom * 100)}%
                </div>

                <RetroIconButton
                  onClick={() => handleZoomChange(0.1)}
                  className="w-10 h-10"
                >
                  <ZoomIn size={20} />
                </RetroIconButton>
              </div>
            </div>
          </>
        )}

        {/* --- KHÔNG GIAN PLAY (FIXED CENTERED) --- */}

        {mode === "PLAY" && (
          <div
            ref={gameWrapperRef}
            className="w-full h-full bg-[url('https://www.transparenttextures.com/patterns/graphy.png')] flex items-center justify-center relative cursor-pointer"
            onPointerDown={(e) => {
              e.stopPropagation();
              if (!showWinModal) {
                activateGame();
              }
            }}
          >
            <div
              ref={gameContainerRef}
              className="block border-4 border-slate-900 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)]"
              style={{
                width: VIEWPORT_WIDTH * BASE_TILE_SIZE,

                height: VIEWPORT_HEIGHT * BASE_TILE_SIZE,
              }}
            ></div>

            {/* Overlay chỉ xuất hiện khi user đã blur (click ra ngoài) */}
            {!isGameFocused && !showWinModal && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 z-30 backdrop-blur-sm cursor-pointer"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  activateGame();
                }}
              >
                <div className="bg-white/95 border-4 border-slate-900 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.8)] px-8 py-6 rounded-lg pointer-events-auto">
                  <p className="text-2xl font-black text-slate-900 mb-2 text-center">
                    Click to Play
                  </p>
                  <p className="text-sm text-slate-600 text-center">
                    Click game area to start
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Win Modal */}
      {showWinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-300"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) handleReplay();
          }}
        >
          <div className="bg-white border-4 border-slate-900 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)] p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              {/* Trophy Icon */}
              <div className="mb-4 p-4 bg-yellow-100 rounded-full">
                <Trophy size={64} className="text-yellow-500" strokeWidth={2} />
              </div>

              {/* Title */}
              <h2 className="text-4xl font-black text-slate-900 mb-2">
                YOU WIN!
              </h2>

              {/* Score */}
              <div className="mb-6">
                <p className="text-lg font-bold text-slate-600 mb-1">Score</p>
                <p className="text-3xl font-black text-orange-500">
                  {winScore.collected} / {winScore.total}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Treasures collected
                </p>
              </div>

              {/* Replay Button */}
              <button
                onClick={handleReplay}
                className="w-full px-6 py-3 bg-green-500 hover:bg-green-400 text-white font-bold text-lg border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-[4px] active:translate-y-[4px] transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={20} strokeWidth={3} />
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function handleReplay() {
    setShowWinModal(false);
    if (kaboomInstanceRef.current) {
      kaboomInstanceRef.current.go("main");
    }
    // sau replay vẫn auto-play? tùy bạn. mình để về overlay để user chủ động:
    setIsGameFocused(false);
    isGameFocusedRef.current = false;
    hasAutoActivatedRef.current = false; // nếu muốn replay xong auto-play luôn thì bỏ dòng này và gọi activateGame()
  }
}
