/// <reference types="kaboom/global" />
import kaboom, { GameObj } from "kaboom";

let started = false;
const TILE = 32;
const CHUNK_SIZE = 16;

export function startGame() {
  if (started) return;
  started = true;

  kaboom({
    global: true,
    canvas: document.getElementById("game") as HTMLCanvasElement,
    width: 960,
    height: 540,
    background: [0, 0, 0],
    scale: 1,
  });
  // debug.inspect = true;
  // debug.showArea = true;
  loadSprite("player-idle", "/sprites/player/Idle.png", {
    sliceX: 4,
    sliceY: 1,
    anims: {
      idle: {
        from: 0,
        to: 3,
        speed: 6,
        loop: true,
      },
    },
  });

  loadSprite("player-run", "/sprites/player/Run.png", {
    sliceX: 6,
    anims: {
      run: { from: 0, to: 5, speed: 10, loop: true },
    },
  });

  loadSprite("player-attack", "/sprites/player/Attack.png", {
    sliceX: 6,
    anims: {
      attack: { from: 0, to: 5, speed: 10, loop: true },
    },
  });

  function loadMapFromStorage() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return null;
    const data = JSON.parse(raw);

    // Convert old tiles format to grid format
    if (data.tiles && !data.grid) {
      const width = data.width || 10;
      const height = data.height || 10;
      const grid = Array(height)
        .fill(0)
        .map(() => Array(width).fill(0));

      for (const [key, value] of Object.entries(data.tiles)) {
        const [x, y] = key.split(",").map(Number);
        if (y < height && x < width) {
          grid[y][x] = value as number;
        }
      }

      data.grid = grid;
      data.width = width;
      data.height = height;
    }

    if (data?.chunks) {
      const chunkSize = data.chunkSize || CHUNK_SIZE;
      const keys = Object.keys(data.chunks);
      if (keys.length === 0) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const key of keys) {
        const [cx, cy] = key.split(",").map(Number);
        minX = Math.min(minX, cx);
        minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx);
        maxY = Math.max(maxY, cy);
      }

      const width = (maxX - minX + 1) * chunkSize;
      const height = (maxY - minY + 1) * chunkSize;
      const grid = Array(height)
        .fill(0)
        .map(() => Array(width).fill(0));

      for (const key of keys) {
        const [cx, cy] = key.split(",").map(Number);
        const chunk = data.chunks[key];
        for (let y = 0; y < chunkSize; y++) {
          for (let x = 0; x < chunkSize; x++) {
            const value = chunk[y]?.[x] ?? 0;
            const gx = (cx - minX) * chunkSize + x;
            const gy = (cy - minY) * chunkSize + y;
            if (gy < height && gx < width) {
              grid[gy][gx] = value;
            }
          }
        }
      }

      return {
        tileSize: data.tileSize || TILE,
        width,
        height,
        grid,
      };
    }

    return data;
  }

  function gridToLevel(grid: number[][]) {
    return grid.map((row) =>
      row
        .map((cell) => {
          if (cell === 1) return "#";
          if (cell === 2) return "^";
          if (cell === 5) return "=";
          if (cell === 6) return "~";
          if (cell === 7) return "-";
          if (cell === 8) return "_";
          return ".";
        })
        .join("")
    );
  }

  function findSpawn(grid: number[][], tileSize: number) {
    // Tìm tất cả floor tiles (5, 6, 7, 8)
    const floorTiles: { x: number; y: number }[] = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (
          grid[y][x] === 5 ||
          grid[y][x] === 6 ||
          grid[y][x] === 7 ||
          grid[y][x] === 8
        ) {
          floorTiles.push({ x, y });
        }
      }
    }

    // Random chọn 1 floor tile
    if (floorTiles.length > 0) {
      const randomTile =
        floorTiles[Math.floor(Math.random() * floorTiles.length)];
      return vec2(
        randomTile.x * tileSize + tileSize / 2,
        randomTile.y * tileSize + tileSize / 2
      );
    }

    return vec2(64, 64); // fallback
  }

  scene("game", () => {
    const mapData = loadMapFromStorage();
    console.log("Loaded map data:", mapData);
    if (!mapData || !mapData.grid) {
      add([text("NO MAP FOUND"), pos(center()), anchor("center")]);
      return;
    }

    const level = gridToLevel(mapData.grid);
    const spawnPos = findSpawn(mapData.grid, mapData.tileSize);

    addLevel(level, {
      tileWidth: mapData.tileSize,
      tileHeight: mapData.tileSize,
      tiles: {
        "#": () => [
          rect(TILE, TILE),
          color(120, 120, 120),
          area(),
          body({ isStatic: true }),
          "ground",
        ],
        ".": () => [],
        "^": () => [
          rect(TILE, TILE),
          color(255, 0, 0),
          area(),
          body({ isStatic: true }),
          "trap",
          "ground",
        ],
        "=": () => [rect(TILE, TILE), color(84, 110, 122), "ground"],
        "~": () => [rect(TILE, TILE), color(96, 125, 139), "ground"],
        "-": () => [rect(TILE, TILE), color(120, 144, 156), "ground"],
        _: () => [rect(TILE, TILE), color(144, 164, 174), "ground"],
      },
    });

    const HITBOX_W = 18;
    const HITBOX_H = 30;

    const player = add([
      sprite("player-idle", { anim: "idle" }),
      pos(spawnPos),
      area({
        shape: new Rect(vec2(0, 0), HITBOX_W, HITBOX_H),
      }),

      body({ gravityScale: 0 }),
      anchor("center"),
      {
        speed: 200,
        hp: 3,
        facing: 1,
        spawnPos: spawnPos,
        moving: false,
        attacking: false,
        spawnProtection: 0,
      },
      "player",
    ]);

    // 🎥 CAMERA FOLLOW
    onUpdate(() => {
      camPos(player.pos);
    });

    const debugBox = add([
      rect(HITBOX_W, HITBOX_H),
      color(0, 255, 0),
      opacity(0.4),
      anchor("center"),
    ]);

    debugBox.onUpdate(() => {
      debugBox.pos = player.pos;
    });

    function respawnPlayer() {
      player.hp = 3;
      player.pos = player.spawnPos.clone();
      player.spawnProtection = 0.5; // 0.5 giây bảo vệ sau khi spawn
    }

    function hitPlayer(from?: GameObj, knockback = true) {
      if (player.invincible) return;

      player.hp -= 1;

      player.invincible = true;
      player.opacity = 0.5;

      if (knockback) {
        // Giật lùi về phía sau lưng (ngược với hướng đang đối mặt)
        const knockbackDir = vec2(-player.facing, 0);
        player.pos = player.pos.add(knockbackDir.scale(24));
      }

      wait(0.5, () => {
        player.invincible = false;
        player.opacity = 1;
      });

      if (player.hp <= 0) {
        respawnPlayer();
      }
    }

    function spawnAttackHitbox() {
      const ATTACK_DISTANCE = 22;
      const ATTACK_W = 14;
      const ATTACK_H = 20;

      const hitbox = add([
        pos(player.pos.x + player.facing * ATTACK_DISTANCE, player.pos.y),
        area({
          shape: new Rect(vec2(0), ATTACK_W, ATTACK_H),
        }),
        anchor("center"),
        lifespan(0.1),
        "attack",
      ]);

      hitbox.onCollide("enemy", (e) => {
        e.hp -= 1;

        const knockDir = vec2(player.facing, 0);
        e.move(knockDir.scale(300));

        if (e.hp <= 0) destroy(e);
      });
    }

    function attack() {
      if (player.attacking) return; // ❌ không spam
      player.attacking = true;

      player.use(sprite("player-attack"));
      player.play("attack");
      player.flipX = player.facing === -1;
      // 🔥 tạo hitbox ở frame chém
      wait(0.1, () => {
        spawnAttackHitbox();
      });

      // ⏱ kết thúc attack
      wait(0.45, () => {
        player.attacking = false;

        // quay về anim đúng trạng thái
        if (player.moving) {
          player.use(sprite("player-run"));
          player.play("run");
        } else {
          player.use(sprite("player-idle"));
          player.play("idle");
        }
      });
    }
    function spawnEnemy(x: number, y: number) {
      const enemy = add([
        rect(24, 24),
        pos(x, y),
        color(255, 80, 80),
        area(),
        body({ gravityScale: 0 }),
        anchor("center"),
        {
          speed: 100,
          dir: 1,
          hp: 3,
        },
        "enemy",
      ]);

      // enemy.onUpdate(() => {
      //   enemy.move(enemy.speed * enemy.dir, 0);
      //   if (time() % 2 < 0.02) enemy.dir *= -1;
      // });

      return enemy;
    }
    // Spawn enemies from map
    for (let y = 0; y < mapData.grid.length; y++) {
      for (let x = 0; x < mapData.grid[y].length; x++) {
        if (mapData.grid[y][x] === 4) {
          spawnEnemy(
            x * mapData.tileSize + mapData.tileSize / 2,
            y * mapData.tileSize + mapData.tileSize / 2
          );
        }
      }
    }

    player.onCollide("enemy", (e) => {
      hitPlayer(e, true); // văng + trừ 1 máu
    });

    player.onCollide("trap", (t) => {
      hitPlayer(t, true); // văng + trừ 1 máu
    });

    player.onCollideUpdate("enemy", () => {
      player.inDanger = true;
    });

    player.onCollideUpdate("trap", () => {
      player.inDanger = true;
    });

    let dangerSource: GameObj | null = null;

    player.onUpdate(() => {
      if (player.attacking) return;

      player.flipX = player.facing === -1;
      if (player.moving) {
        if (player.curAnim() !== "run") {
          player.use(sprite("player-run"));
          player.play("run");
        }
      } else {
        if (player.curAnim() !== "idle") {
          player.use(sprite("player-idle"));
          player.play("idle");
        }
      }

      // Giảm spawn protection
      if (player.spawnProtection > 0) {
        player.spawnProtection -= dt();
      }

      // Kiểm tra xem player có đứng trên ground không (luôn luôn check)
      const playerGridX = Math.floor(player.pos.x / mapData.tileSize);
      const playerGridY = Math.floor(player.pos.y / mapData.tileSize);

      const currentTile = mapData.grid[playerGridY]?.[playerGridX];
      const isOnFloor =
        currentTile === 5 ||
        currentTile === 6 ||
        currentTile === 7 ||
        currentTile === 8;

      if (
        playerGridX < 0 ||
        playerGridX >= mapData.width ||
        playerGridY < 0 ||
        playerGridY >= mapData.height ||
        !isOnFloor
      ) {
        // Không có ground bên dưới -> rơi xuống hố -> chết ngay lập tức
        if (player.spawnProtection <= 0) {
          respawnPlayer();
          return;
        }
      }

      // reset cho frame sau
      player.moving = false;
      if (!player.inDanger) {
        player.damageTimer = 0;
        return;
      }

      player.damageTimer += dt();

      if (player.damageTimer >= 1) {
        hitPlayer(undefined, false); // ❗ KHÔNG knockback
        player.damageTimer = 0;
      }

      player.inDanger = false;
    });

    onKeyDown("a", () => {
      if (player.attacking) return;

      player.move(-player.speed, 0);
      player.moving = true;
      player.facing = -1;
      player.flipX = true; // 👈 lật sang trái
    });
    onKeyDown("d", () => {
      if (player.attacking) return;

      player.move(player.speed, 0);
      player.moving = true;
      player.facing = 1;
      player.flipX = false; // 👈 lật sang phải
    });

    onKeyDown("w", () => {
      if (player.attacking) return;

      player.move(0, -player.speed);
      player.moving = true;
    });

    onKeyDown("s", () => {
      if (player.attacking) return;

      player.move(0, player.speed);
      player.moving = true;
    });
    onKeyPress("space", () => attack());
  });

  go("game");
}
