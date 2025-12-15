import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import kaboom from "kaboom";
import { ArrowLeft, Edit3, Trophy, RotateCcw } from "lucide-react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  fetchDungeonById,
  readDungeonMap,
  validateMapJsonSchema,
} from "../services/dungeonService";
import { PACKAGE_ID } from "../config/sui";

export default function Play() {
  const { id } = useParams();
  const account = useCurrentAccount();
  const gameContainerRef = useRef(null);
  const [gameData, setGameData] = useState(null);
  const [scale, setScale] = useState(1);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [showWinModal, setShowWinModal] = useState(false);
  const [winScore, setWinScore] = useState({ collected: 0, total: 0 });

  // mặc định false, nhưng sẽ auto-activate 1 lần sau khi load xong
  const [isGameFocused, setIsGameFocused] = useState(false);
  const isGameFocusedRef = useRef(false);

  const kaboomInstanceRef = useRef(null);
  const gameWrapperRef = useRef(null);

  // đảm bảo auto-activate chỉ chạy 1 lần cho mỗi lần vào page
  const hasAutoActivatedRef = useRef(false);

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

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        let game = null;
        if (PACKAGE_ID) {
          const onchain = await fetchDungeonById(id);
          if (onchain) {
            game = onchain;

            if (active) setGameData(game);

            setLoadingMap(true);
            setMapError(null);
            try {
              const idToUse = onchain.patchMapId || onchain.blobId;
              if (!idToUse) throw new Error("No patchMapId or blobId");
              const mapJson = await readDungeonMap(idToUse);
              if (!validateMapJsonSchema(mapJson))
                throw new Error("Invalid Map");

              if (active) {
                setGameData({ ...game, settings: mapJson });
              }
            } catch (mapErr) {
              console.error("Error loading map:", mapErr);
              if (active) setMapError(mapErr.message);
            } finally {
              if (active) setLoadingMap(false);
            }
          } else {
            if (active) setGameData(null);
          }
        } else {
          if (active) setGameData(null);
        }
      } catch (err) {
        console.error(err);
        if (active) {
          setGameData(null);
          setMapError(err.message);
          setLoadingMap(false);
        }
      }
    };

    // reset auto-activate khi đổi id
    hasAutoActivatedRef.current = false;
    setIsGameFocused(false);
    isGameFocusedRef.current = false;

    load();
    return () => {
      active = false;
    };
  }, [id, account]);

  // AUTO PLAY: khi map sẵn sàng lần đầu -> tự focus để chơi liền
  useEffect(() => {
    if (hasAutoActivatedRef.current) return;
    if (showWinModal) return;
    if (loadingMap || mapError) return;
    if (!gameData?.settings) return;

    hasAutoActivatedRef.current = true;
    activateGame();
  }, [loadingMap, mapError, gameData, showWinModal, activateGame]);

  useEffect(() => {
    if (
      !gameData ||
      !gameContainerRef.current ||
      !gameData.settings?.layout ||
      !gameData.settings?.config
    )
      return;

    const { settings } = gameData;
    const tileSize = settings.config.tileSize || 32;
    const width = settings.config.width * tileSize;
    const height = settings.config.height * tileSize;

    const scaleFactor = Math.min(
      (window.innerWidth * 0.95) / width,
      (window.innerHeight * 0.85) / height,
      1.2
    );
    setScale(scaleFactor);

    let k;
    let isCleanedUp = false;

    if (gameContainerRef.current.innerHTML !== "") {
      gameContainerRef.current.innerHTML = "";
    }

    try {
      k = kaboom({
        width,
        height,
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
              if (col.isLeft() || col.isRight()) dir = -dir;
            });
          },
          update() {
            this.move(speed * dir, 0);
          },
        };
      }

      const validSprites = new Set();
      const loadPromises = [];
      const tilesDef = {};
      const assets = settings.assets || {};

      Object.keys(assets).forEach((key) => {
        const asset = assets[key];
        tilesDef[key] = () => {
          const comps = [
            k.area(),
            k.body({ isStatic: true }),
            `wall_${key}`,
            "wall",
          ];

          if (asset.type === "image" && asset.value) {
            const p = k
              .loadSprite(`wall_${key}`, asset.value)
              .then(() => validSprites.add(key))
              .catch(() => {});
            loadPromises.push(p);
          }

          if (asset.type === "image" && asset.value && validSprites.has(key)) {
            comps.push(
              k.sprite(`wall_${key}`, { width: tileSize, height: tileSize })
            );
          } else {
            const colorHex = asset.type === "color" ? asset.value : "#94a3b8";
            comps.push(k.rect(tileSize, tileSize));
            comps.push(k.color(k.Color.fromHex(colorHex)));
            comps.push(k.outline(2, k.BLACK));
          }
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

      Promise.all(loadPromises).then(() => {
        if (isCleanedUp) return;

        const levelConfig = {
          tileWidth: tileSize,
          tileHeight: tileSize,
          tiles: tilesDef,
        };

        k.scene("main", () => {
          const levelMap = settings.layout.map((row) => row);
          const level = k.addLevel(levelMap, levelConfig);
          const players = level.get("player");

          const totalCoins = settings.layout
            .join("")
            .split("")
            .filter((c) => c === "$").length;
          let collectedCoins = 0;
          let isWon = false;

          if (players.length > 0) {
            const player = players[0];
            const SPEED = 200;
            const JUMP_FORCE = 600;

            k.camPos(player.pos);

            player.onUpdate(() => {
              if (isWon) return;
              k.camPos(player.pos);
              if (player.pos.y > settings.config.height * tileSize + 200) {
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

              if (collectedCoins >= totalCoins) {
                isWon = true;
                k.shake(10);
                k.addKaboom(player.pos);

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

    return () => {
      isCleanedUp = true;
      if (k && k.quit) k.quit();
    };
  }, [gameData, focusGameCanvas]);

  // Click outside: blur game
  useEffect(() => {
    const handlePointerDownOutside = (event) => {
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
  }, []);

  // Sync ref with state (và focus lại canvas nếu state chuyển true)
  useEffect(() => {
    isGameFocusedRef.current = isGameFocused;
    if (isGameFocused) requestAnimationFrame(() => focusGameCanvas());
  }, [isGameFocused, focusGameCanvas]);

  if (!gameData) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-orange-50 text-slate-900">
        <p className="text-lg font-bold mb-4">Map not found</p>
        <Link
          to="/"
          className="px-4 py-2 border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] font-bold"
        >
          Return to Home
        </Link>
      </div>
    );
  }

  const tileSize = gameData.settings?.config?.tileSize || 32;
  const width = gameData.settings?.config?.width
    ? gameData.settings.config.width * tileSize
    : 640;
  const height = gameData.settings?.config?.height
    ? gameData.settings.config.height * tileSize
    : 384;

  return (
    <div className="min-h-screen bg-linear-to-br from-orange-50 to-orange-100 relative flex flex-col items-center justify-center p-6 text-slate-900">
      <header className="absolute top-6 left-6 right-6 flex items-center justify-between z-10">
        <Link
          to="/"
          className="px-3 py-2 border-2 border-slate-900 bg-white shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] font-bold flex items-center gap-2"
        >
          <ArrowLeft strokeWidth={3} size={16} />
          Home
        </Link>

        <div className="text-lg font-black text-slate-900 text-center flex-1">
          {gameData.settings?.meta?.title || gameData.name || "Loading..."}
        </div>

        <Link
          to={`/editor/${id}`}
          className="px-3 py-2 border-2 border-slate-900 bg-yellow-400 hover:bg-yellow-300 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] font-bold flex items-center gap-2"
        >
          <Edit3 strokeWidth={3} size={16} />
          Edit
        </Link>
      </header>

      <div className="w-full flex items-center justify-center mt-16">
        <div
          ref={gameWrapperRef}
          className="border-4 border-slate-900 shadow-[16px_16px_0px_0px_rgba(0,0,0,0.8)] bg-white flex items-center justify-center relative cursor-pointer"
          style={{
            maxWidth: "92vw",
            maxHeight: "82vh",
            overflow: "hidden",
            minWidth: width,
            minHeight: height,
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            if (
              !loadingMap &&
              !mapError &&
              gameData.settings &&
              !showWinModal
            ) {
              activateGame();
            }
          }}
        >
          {loadingMap && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90 z-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-orange-500 mb-4"></div>
              <p className="text-sm font-bold text-slate-700">Loading map...</p>
            </div>
          )}

          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-[60]">
              <div className="text-center p-8 bg-white border-4 border-red-500 shadow-xl max-w-md">
                <h2 className="text-2xl font-black text-red-600 mb-4">ERROR</h2>
                <div className="text-slate-700 font-bold font-mono whitespace-pre-wrap">
                  {mapError}
                </div>
                <Link
                  to="/"
                  className="inline-block mt-6 px-6 py-2 bg-slate-900 text-white font-bold uppercase hover:bg-slate-700"
                >
                  Return to Home
                </Link>
              </div>
            </div>
          )}

          {!loadingMap && !mapError && gameData.settings && (
            <div
              ref={gameContainerRef}
              className="block"
              style={{
                width,
                height,
                transform: `scale(${scale})`,
                transformOrigin: "center",
              }}
            />
          )}

          {/* Overlay chỉ xuất hiện khi user đã blur (click ra ngoài) */}
          {!loadingMap &&
            !mapError &&
            gameData.settings &&
            !isGameFocused &&
            !showWinModal && (
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
                    Click vào khu vực game để bắt đầu
                  </p>
                </div>
              </div>
            )}
        </div>
      </div>

      <div className="mt-6 px-4 py-3 bg-white/80 border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,0.6)] text-sm font-mono text-slate-800 text-center max-w-3xl">
        <div className="font-bold mb-2">Instructions</div>
        <div className="flex flex-wrap justify-center gap-4">
          <span>← / → : Move</span>
          <span>↑ or Space: Jump</span>
          <span>$ Collect all coins to win</span>
        </div>
      </div>

      {showWinModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 animate-in fade-in duration-300"
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) handleReplay();
          }}
        >
          <div className="bg-white border-4 border-slate-900 shadow-[20px_20px_0px_0px_rgba(0,0,0,1)] p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 p-4 bg-yellow-100 rounded-full">
                <Trophy size={64} className="text-yellow-500" strokeWidth={2} />
              </div>

              <h2 className="text-4xl font-black text-slate-900 mb-2">
                YOU WIN!
              </h2>

              <div className="mb-6">
                <p className="text-lg font-bold text-slate-600 mb-1">Score</p>
                <p className="text-3xl font-black text-orange-500">
                  {winScore.collected} / {winScore.total}
                </p>
                <p className="text-sm text-slate-500 mt-1">
                  Treasures collected
                </p>
              </div>

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
