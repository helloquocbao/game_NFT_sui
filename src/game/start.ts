/// <reference types="kaboom/global" />
import kaboom, { GameObj } from "kaboom";

let started = false;
const TILE = 32;

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

  /* ================= SPRITES ================= */

  loadSprite("player-idle", "/sprites/player/Idle.png", {
    sliceX: 4,
    anims: { idle: { from: 0, to: 3, speed: 6, loop: true } },
  });

  loadSprite("player-run", "/sprites/player/Run.png", {
    sliceX: 6,
    anims: { run: { from: 0, to: 5, speed: 10, loop: true } },
  });

  loadSprite("player-attack", "/sprites/player/Attack.png", {
    sliceX: 6,
    anims: { attack: { from: 0, to: 5, speed: 10, loop: true } },
  });

  /* ================= MAP LOAD ================= */

  function loadMapFromStorage() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return null;
    const data = JSON.parse(raw);

    if (data.tiles && !data.grid) {
      const w = data.width || 20;
      const h = data.height || 12;
      const grid = Array(h)
        .fill(0)
        .map(() => Array(w).fill(0));

      for (const [k, v] of Object.entries(data.tiles)) {
        const [x, y] = k.split(",").map(Number);
        if (y < h && x < w) grid[y][x] = v as number;
      }

      data.grid = grid;
      data.width = w;
      data.height = h;
    }

    return data;
  }

  function gridToLevel(grid: number[][]) {
    return grid.map((row) =>
      row
        .map((c) => {
          if (c === 1) return "#";
          if (c === 2) return "^";
          if (c === 5) return "=";
          if (c === 6) return "~";
          if (c === 7) return "-";
          if (c === 8) return "_";
          return ".";
        })
        .join("")
    );
  }

  function findSpawn(grid: number[][], tileSize: number) {
    const floors: { x: number; y: number }[] = [];
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] >= 5) floors.push({ x, y });
      }
    }
    if (floors.length === 0) return vec2(64, 64);
    const t = choose(floors);
    return vec2(t.x * tileSize + tileSize / 2, t.y * tileSize + tileSize / 2);
  }

  /* ================= SCENE ================= */

  scene("game", () => {
    const mapData = loadMapFromStorage();
    if (!mapData?.grid) {
      add([text("NO MAP FOUND"), pos(center()), anchor("center")]);
      return;
    }

    const level = gridToLevel(mapData.grid);
    const spawnPos = findSpawn(mapData.grid, mapData.tileSize);

    addLevel(level, {
      tileWidth: mapData.tileSize,
      tileHeight: mapData.tileSize,
      tiles: {
        "#": () => [rect(TILE, TILE), color(120, 120, 120), area(), "wall"],
        "^": () => [rect(TILE, TILE), color(255, 0, 0), area(), "trap"],
        "=": () => [rect(TILE, TILE), color(84, 110, 122), "floor"],
        "~": () => [rect(TILE, TILE), color(96, 125, 139), "floor"],
        "-": () => [rect(TILE, TILE), color(120, 144, 156), "floor"],
        _: () => [rect(TILE, TILE), color(144, 164, 174), "floor"],
      },
    });

    /* ================= HELPERS ================= */

    function isWalkable(tile: number) {
      return tile >= 5;
    }

    function getTileAt(pos: Vec2) {
      const x = Math.floor(pos.x / mapData.tileSize);
      const y = Math.floor(pos.y / mapData.tileSize);
      return mapData.grid[y]?.[x] ?? 0;
    }

    function isOutsideMap(pos: Vec2) {
      const x = Math.floor(pos.x / mapData.tileSize);
      const y = Math.floor(pos.y / mapData.tileSize);
      return x < 0 || y < 0 || x >= mapData.width || y >= mapData.height;
    }

    function tryMove(entity, dir: Vec2) {
      const currentTile = getTileAt(entity.pos);
      const nextPos = entity.pos.add(dir.scale(entity.speed * dt()));
      const nextTile = getTileAt(nextPos);

      // CHỈ CHẶN WALL / TRAP
      if (nextTile === 1 || nextTile === 2) return;

      // cho phép đi kể cả ra ngoài map (để rơi)
      entity.move(dir.scale(entity.speed));
    }

    /* ================= PLAYER ================= */

    const player = add([
      sprite("player-idle", { anim: "idle" }),
      pos(spawnPos),
      area(),
      anchor("center"),
      {
        speed: 200,
        facing: 1,
        moving: false,
        attacking: false,
        spawnProtection: 0.5,
        spawnPos,
      },
      "player",
    ]);

    onUpdate(() => camPos(player.pos));

    function respawnPlayer() {
      player.pos = player.spawnPos.clone();
      player.spawnProtection = 0.5;
      player.opacity = 1;
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
      if (player.attacking) return;
      player.attacking = true;

      player.use(sprite("player-attack"));
      player.play("attack");

      wait(0.1, () => spawnAttackHitbox());

      wait(0.45, () => {
        player.attacking = false;

        if (player.moving) {
          player.use(sprite("player-run"));
          player.play("run");
        } else {
          player.use(sprite("player-idle"));
          player.play("idle");
        }
      });
    }

    player.onUpdate(() => {
      if (isOutsideMap(player.pos) && player.spawnProtection <= 0) {
        player.opacity = 0.3;
        wait(0.25, respawnPlayer);
        return;
      }

      if (player.spawnProtection > 0) {
        player.spawnProtection -= dt();
      }

      player.moving = false;
    });

    onKeyDown("a", () => {
      tryMove(player, vec2(-1, 0));
      player.facing = -1;
      player.moving = true;
      player.flipX = true;
    });

    onKeyDown("d", () => {
      tryMove(player, vec2(1, 0));
      player.facing = 1;
      player.moving = true;
      player.flipX = false;
    });

    onKeyDown("w", () => tryMove(player, vec2(0, -1)));
    onKeyDown("s", () => tryMove(player, vec2(0, 1)));
    onKeyPress("space", attack);

    /* ================= ENEMY ================= */

    function spawnEnemy(x: number, y: number) {
      const enemy = add([
        rect(24, 24),
        pos(x, y),
        color(255, 80, 80),
        area(),
        anchor("center"),
        {
          speed: 80,
          dir: vec2(0, 0),
          timer: 0,
        },
        "enemy",
      ]);

      enemy.onUpdate(() => {
        if (isOutsideMap(enemy.pos)) {
          destroy(enemy);
          return;
        }

        enemy.timer -= dt();
        if (enemy.timer <= 0) {
          enemy.timer = rand(1, 2);
          enemy.dir = choose([
            vec2(1, 0),
            vec2(-1, 0),
            vec2(0, 1),
            vec2(0, -1),
          ]);
        }

        const next = enemy.pos.add(enemy.dir.scale(enemy.speed * dt()));
        if (isWalkable(getTileAt(next))) {
          enemy.move(enemy.dir.scale(enemy.speed * dt()));
        } else {
          enemy.timer = 0;
        }
      });
    }

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
  });

  go("game");
}
