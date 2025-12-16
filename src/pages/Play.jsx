import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import kaboom from "kaboom";
import { ArrowLeft, Edit3, Trophy, RotateCcw } from "lucide-react";
import { fetchDungeonById } from "../services/dungeonService";

import dataLocal from "../services/dataLocal.json";

export default function Play() {
  const { id } = useParams();
  const gameContainerRef = useRef(null);
  const [gameData, setGameData] = useState(null);
  const [scale, setScale] = useState(1);
  const [loadingMap, setLoadingMap] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [showWinModal, setShowWinModal] = useState(false);

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
        const onchain = await fetchDungeonById(id);

        if (onchain) {
          game = onchain;
        } else {
          // Fallback: use dataLocal as default game
          game = {
            id: id || "demo-1",
            name: "Local Game",
            creator: "local",
            settings: dataLocal,
          };
        }

        if (active) setGameData(game);

        setLoadingMap(true);
        setMapError(null);
        try {
          const mapJson = dataLocal;
          // Validate map exists and has structure
          if (!mapJson || !mapJson.layout || !mapJson.config) {
            throw new Error("Invalid Map: Missing layout or config");
          }
          if (!Array.isArray(mapJson.layout) || mapJson.layout.length === 0) {
            throw new Error("Invalid Map: Empty layout");
          }

          if (active) {
            setGameData({ ...game, settings: mapJson });
          }
        } catch (mapErr) {
          console.error("Error loading map:", mapErr);
          if (active) setMapError(mapErr.message);
        } finally {
          if (active) setLoadingMap(false);
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
  }, [id]);

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

    if (!gameContainerRef.current) return;

    try {
      k = kaboom({
        width,
        height,
        scale: 1.4,
        root: gameContainerRef.current,
        global: false,
        background: [255, 247, 237],
      });
      k.debug.inspect = true;
      k.debug.showArea = true;
      kaboomInstanceRef.current = k;
      // 2D RPG TOP-DOWN MODE: Không có gravity
      k.setGravity(0);

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
          }
          return comps;
        };
      });

      // Default wall definitions nếu không có trong assets
      const defaultWalls = {
        1: "#f97316", // Orange
        2: "#64748b", // Gray
        3: "#78350f", // Brown
      };

      Object.entries(defaultWalls).forEach(([key, color]) => {
        if (!tilesDef[key]) {
          tilesDef[key] = () => [
            k.rect(tileSize, tileSize),
            k.color(k.Color.fromHex(color)),
            k.area(),
            k.body({ isStatic: true }),
            `wall_${key}`,
            "wall",
          ];
        }
      });

      // Floor/Grass tile (walkable)
      tilesDef["."] = () => [
        k.rect(tileSize, tileSize),
        k.color(34, 139, 34), // Green grass
        k.z(0), // Floor ở layer thấp nhất
        "floor",
      ];

      // Void/Empty tile (deadly)
      tilesDef[" "] = () => [
        k.rect(tileSize, tileSize),
        k.color(0, 0, 0), // Black void
        k.area(),
        k.z(0),
        "void",
      ];

      tilesDef["$"] = () => [
        k.circle(10),
        k.color(234, 179, 8),

        k.pos(16, 16),
        "coin",
      ];

      tilesDef["@"] = () => {
        const comps = [
          k.sprite("idle", {
            width: 32,
            height: 32,
          }),
          k.area({
            shape: new k.Rect(k.vec2(0, 7), 28, 30),
          }),
          k.body(),
          k.anchor("bot"),
          k.z(1), // Player luôn trên floor
          "player",
        ];

        return comps;
      };

      // Custom component to display HP
      function enemyWithHp() {
        let hpText = null;
        return {
          id: "enemyHpDisplay",
          require: ["pos"],
          add() {
            this.hp = 5;
            hpText = k.add([
              k.text(`HP: ${this.hp}`, { size: 14, weight: "bold" }),
              k.color(0, 0, 0),
              k.pos(this.pos.x, this.pos.y - 20),
            ]);
          },
          update() {
            if (hpText) {
              hpText.text = `HP: ${this.hp}`;
              hpText.pos = this.pos.add(0, -20);
            }
          },
          destroy() {
            if (hpText) k.destroy(hpText);
          },
        };
      }

      // Enemy out of bounds checker
      function outOfBoundsChecker() {
        return {
          id: "outOfBoundsChecker",
          require: ["pos"],
          update() {
            const mapHeight = settings.layout.length * tileSize;
            const mapWidth = settings.layout[0].length * tileSize;

            // Ra khỏi map thì destroy
            if (
              this.pos.y > mapHeight + 50 ||
              this.pos.y < -50 ||
              this.pos.x > mapWidth + 50 ||
              this.pos.x < -50
            ) {
              k.addKaboom(this.pos);
              k.destroy(this);
            }
          },
        };
      }

      tilesDef["E"] = () => [
        k.rect(24, 24),
        k.color(168, 85, 247),
        k.area(),
        k.body(),
        k.anchor("center"),
        k.pos(16, 16),
        k.z(1), // Enemy cùng layer với player
        enemyWithHp(),
        outOfBoundsChecker(),
        // patrol(),
        "enemy",
        "danger",
      ];

      tilesDef["^"] = () => [
        k.polygon([k.vec2(0, 32), k.vec2(16, 0), k.vec2(32, 32)]),
        k.color(239, 68, 68),

        k.area(),
        k.body({ isStatic: true }),
        "trap",
        "danger",
      ];

      // Load player sprites TRƯỚC KHI tạo level - mỗi trạng thái một file
      const playerSpritePromises = [];

      playerSpritePromises.push(
        k.loadSpriteAtlas("/sprites/player/Idle.png", {
          idle: {
            x: 0,
            y: 0,
            width: 160,
            height: 40,
            sliceX: 4,
            sliceY: 1,
            anims: {
              idle: { from: 2, to: 3, speed: 4, loop: true },
            },
          },
        })
      );

      playerSpritePromises.push(
        k.loadSpriteAtlas("/sprites/player/Run.png", {
          run: {
            x: 0,
            y: 0,
            width: 250,
            height: 40,
            sliceX: 6,
            sliceY: 1,
            anims: {
              run: { from: 0, to: 5, speed: 10, loop: true },
            },
          },
        })
      );

      playerSpritePromises.push(
        k.loadSpriteAtlas("/sprites/player/Attack.png", {
          attack: {
            x: 0,
            y: 0,
            width: 250,
            height: 40,
            sliceX: 6,
            sliceY: 1,
            anims: {
              attack: { from: 0, to: 5, speed: 10, loop: true },
            },
          },
        })
      );

      playerSpritePromises.push(
        k.loadSpriteAtlas("/sprites/player/Death.png", {
          death: {
            x: 0,
            y: 0,
            width: 160,
            height: 40,
            sliceX: 4,
            sliceY: 1,
            anims: {
              death: { from: 0, to: 3, speed: 6, loop: false },
            },
          },
        })
      );

      Promise.all([...loadPromises, ...playerSpritePromises])
        .then(() => {
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

            if (players.length > 0) {
              const player = players[0];
              const SPEED = 150; // TOP-DOWN: Walking speed
              const deathPointOffset = k.vec2(0, 8);
              // Player HP system
              player.maxHp = 2;
              player.hp = 2;

              k.camPos(player.pos);

              // Play idle animation khi bắt đầu
              try {
                player.play("idle");
              } catch {
                console.warn("Could not play idle animation");
              }

              // Add HP UI Bar at top left

              const hpBar = k.add([
                k.rect(196, 26),
                k.color(34, 197, 94),
                k.pos(12, 12),
                { fixed: true, z: 101 },
              ]);

              // Vẽ vòng tròn tầm đánh của player
              // Tạo polygon nhiều cạnh để xấp xỉ hình tròn (16 cạnh)
              const circlePoints = [];
              const radius = 22;
              const sides = 16;
              for (let i = 0; i < sides; i++) {
                const angle = (i / sides) * Math.PI * 2;
                circlePoints.push(
                  k.vec2(Math.cos(angle) * radius, Math.sin(angle) * radius)
                );
              }

              let isDead = false; // Flag để tránh chết nhiều lần
              player.onUpdate(() => {
                if (isDead) return;

                // Tọa độ tâm đỏ
                const deathPoint = player.pos.add(deathPointOffset);

                // Lấy toàn bộ void tile
                const voids = level.get("void");

                for (const v of voids) {
                  const left = v.pos.x;
                  const right = v.pos.x + tileSize;
                  const top = v.pos.y;
                  const bottom = v.pos.y + tileSize;

                  if (
                    deathPoint.x >= left &&
                    deathPoint.x <= right &&
                    deathPoint.y >= top &&
                    deathPoint.y <= bottom
                  ) {
                    // 💀 CHẾT
                    isDead = true;
                    player.hp = 0;

                    k.shake(30);
                    k.addKaboom(player.pos);

                    setTimeout(() => {
                      k.go("main");
                    }, 800);

                    break;
                  }
                }
              });
              const attackRangeCircle = k.add([
                k.pos(player.pos.add(0, -15)), // Offset lên trên 15px
                k.circle(24), // Vẽ hình tròn
                k.area({ shape: new k.Polygon(circlePoints) }), // Hitbox polygon xấp xỉ hình tròn
                k.opacity(0),
                k.z(999),
                {
                  update() {
                    this.pos = player.pos.add(0, -15); // Offset lên trên 15px

                    // Kiểm tra nếu TÂM ANCHOR (bottom-center point) chạm void thì player chết
                    if (!isDead) {
                      const voids = level.get("void");
                      for (const voidTile of voids) {
                        // Player anchor là "bot" nên player.pos là điểm bottom-center
                        // Void tile có area, dùng isOverlapping để check điểm chính xác
                        const anchorPoint = player.pos;

                        // Check if anchor point is inside void tile area
                        if (
                          anchorPoint.x > voidTile.pos.x &&
                          anchorPoint.x < voidTile.pos.x + tileSize &&
                          anchorPoint.y > voidTile.pos.y &&
                          anchorPoint.y < voidTile.pos.y + tileSize
                        ) {
                          isDead = true;
                          player.hp = 0;
                          k.shake(30);
                          k.addKaboom(player.pos);
                          setTimeout(() => {
                            k.go("main");
                          }, 1000);
                          break;
                        }
                      }
                    }
                  },
                },
              ]);

              // Update HP display function
              const updateHpDisplay = () => {
                const hpPercent = Math.max(0, player.hp / player.maxHp);
                const barWidth = 196 * hpPercent;
                hpBar.width = barWidth;

                // Change color based on HP
                if (hpPercent > 0.5) {
                  hpBar.color = [34, 197, 94]; // Green
                } else if (hpPercent > 0.25) {
                  hpBar.color = [234, 179, 8]; // Yellow
                } else {
                  hpBar.color = [239, 68, 68]; // Red
                }
              };

              // Update player each frame
              player.onUpdate(() => {
                k.camPos(player.pos);
                updateHpDisplay();
              });

              // 2D RPG: 4-directional movement
              const keys = {
                left: false,
                right: false,
                up: false,
                down: false,
              };

              let lastAttackTime = 0;
              const attackCooldown = 600; // ms between attacks

              k.onKeyDown("left", () => {
                keys.left = true;
              });
              k.onKeyRelease("left", () => {
                keys.left = false;
              });

              k.onKeyDown("right", () => {
                keys.right = true;
              });
              k.onKeyRelease("right", () => {
                keys.right = false;
              });

              k.onKeyDown("up", () => {
                keys.up = true;
              });
              k.onKeyRelease("up", () => {
                keys.up = false;
              });

              k.onKeyDown("down", () => {
                keys.down = true;
              });
              k.onKeyRelease("down", () => {
                keys.down = false;
              });

              // Attack with spacebar
              let isAttacking = false;
              k.onKeyDown("space", () => {
                const now = Date.now();

                // Nếu đang cooldown hoặc đang attack thì không làm gì cả
                if (now - lastAttackTime < attackCooldown || isAttacking) {
                  return;
                }

                lastAttackTime = now;
                isAttacking = true;

                // Play attack animation
                try {
                  const currentFlip = player.flipX;
                  player.use(k.sprite("attack"));
                  player.flipX = currentFlip; // Giữ nguyên hướng
                  player.play("attack");
                  // Quay về idle sau attack animation
                  setTimeout(() => {
                    try {
                      player.use(k.sprite("idle"));
                      player.flipX = currentFlip; // Giữ nguyên hướng
                      player.play("idle");
                      isAttacking = false;
                      // Ẩn vòng tròn tầm đánh
                      attackRangeCircle.opacity = 0;
                    } catch {
                      player.play("idle");
                      isAttacking = false;
                      attackRangeCircle.opacity = 0;
                    }
                  }, 600); // 600ms cho attack animation (6 frames * 100ms)
                } catch {
                  isAttacking = false;
                  attackRangeCircle.opacity = 0;
                }

                // Get all enemies from level
                const enemies = level.get("enemy");
                let hitCount = 0;

                console.log("Attack! Enemies found:", enemies.length);

                // Damage enemies that overlap with attack range circle
                enemies.forEach((enemy) => {
                  // Check if enemy hitbox overlaps with attack circle
                  const isColliding = attackRangeCircle.isColliding(enemy);

                  console.log("Enemy HP:", enemy.hp, "Colliding:", isColliding);

                  if (isColliding) {
                    console.log("Hit! Dealing damage");
                    if (enemy.hp !== undefined && enemy.hp > 0) {
                      enemy.hp -= 1;
                      hitCount++;
                      k.shake(3);

                      // Show "-1" damage text
                      k.add([
                        k.text("-1", { size: 14, weight: "bold" }),
                        k.color(255, 100, 100),
                        k.pos(enemy.pos),
                        k.lifespan(0.5),
                        {
                          speed: 100,
                        },
                        k.move(k.vec2(0, -1), 100),
                      ]);

                      // Enemy dies when hp reaches 0
                      if (enemy.hp <= 0) {
                        k.addKaboom(enemy.pos);
                        k.destroy(enemy);
                      }
                    }
                  }
                });

                console.log("Hit count:", hitCount);

                // Show attack feedback
                if (hitCount > 0) {
                  k.shake(5);
                }
              });

              // Apply movement every frame
              let isMoving = false;
              let playerDirection = false; // false = right, true = left

              player.onUpdate(() => {
                // Kiểm tra rơi chết (ra khỏi map)
                const mapHeight = settings.layout.length * tileSize;
                const mapWidth = settings.layout[0].length * tileSize;

                if (
                  player.pos.y > mapHeight + 50 ||
                  player.pos.y < -50 ||
                  player.pos.x > mapWidth + 50 ||
                  player.pos.x < -50
                ) {
                  player.hp = 0;
                  k.shake(30);
                  k.addKaboom(player.pos);
                  setTimeout(() => {
                    k.go("main");
                  }, 1000);
                  return;
                }

                let vx = 0;
                let vy = 0;
                if (keys.left) vx = -SPEED;
                if (keys.right) vx = SPEED;
                if (keys.up) vy = -SPEED;
                if (keys.down) vy = SPEED;

                const wasMoving = isMoving;
                isMoving = vx !== 0 || vy !== 0;

                // Lưu hướng player khi di chuyển trái/phải
                if (keys.left) {
                  playerDirection = true;
                  player.flipX = true;
                } else if (keys.right) {
                  playerDirection = false;
                  player.flipX = false;
                }

                // Move player in 4 directions (top-down)
                if (isMoving) {
                  player.move(vx, vy);

                  // Play run animation khi moving
                  if (!wasMoving) {
                    try {
                      player.use(k.sprite("run"));
                      player.flipX = playerDirection; // Khôi phục hướng
                      player.play("run");
                      console.log("Playing run animation");
                    } catch (e) {
                      console.warn("Cannot play run animation:", e);
                    }
                  }
                } else if (wasMoving) {
                  // Play idle animation khi dừng lại
                  try {
                    player.use(k.sprite("idle"));
                    player.flipX = playerDirection; // Khôi phục hướng
                    player.play("idle");
                    console.log("Playing idle animation");
                  } catch (e) {
                    console.warn("Cannot play idle animation:", e);
                  }
                }
              });

              player.onCollide("coin", (c) => {
                k.destroy(c);
                k.shake(2);
              });
            }

            // nếu đang focused thì focus canvas ngay sau khi scene ready
            if (isGameFocusedRef.current) {
              requestAnimationFrame(() => focusGameCanvas());
            }
          });

          k.go("main");
        })
        .catch((err) => {
          console.error("Error loading sprites:", err);
        });
    } catch (err) {
      console.error("Failed to initialize game:", err);
    }

    return () => {
      isCleanedUp = true;
      if (k && k.quit) k.quit();
    };
  }, [gameData, focusGameCanvas]);

  const handlePointerDownOutside = (event) => {
    if (
      gameWrapperRef.current &&
      !gameWrapperRef.current.contains(event.target)
    ) {
      setIsGameFocused(false);
      isGameFocusedRef.current = false;
    }
  };

  useEffect(() => {
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
            <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-60">
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
        <div className="font-bold mb-2">Controls</div>
        <div className="flex flex-wrap justify-center gap-4">
          <span>← / → : Move Left/Right</span>
          <span>↑ / ↓ : Move Up/Down</span>
          <span>Explore the world!</span>
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
              <h2 className="text-2xl font-black text-slate-900 mb-2">
                Game Mode Active
              </h2>
              <p className="text-slate-600 mb-6">
                Use arrow keys to move around the world!
              </p>

              <button
                onClick={handleReplay}
                className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-400 text-white font-bold text-lg border-2 border-slate-900 shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] active:shadow-none active:translate-x-1 active:translate-y-1 transition-all"
              >
                Close
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
