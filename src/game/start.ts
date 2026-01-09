/// <reference types="kaboom/global" />
import kaboom, { GameObj } from "kaboom";
import {
  TILE_DEFS,
  TILE_SPRITE_SIZE,
  getTileDef,
  isTileDefined,
  isWalkableTile,
} from "./tiles";

let started = false;
const TILE = 32;
const CHUNK_SIZE = 16;
const PLAY_STATE_KEY = "PLAY_STATE";
const PLAY_TARGET_KEY = "PLAY_TARGET";

type GameMapData = {
  tileSize: number;
  grid: number[][];
  worldId?: string;
};

export function startGame(mapData?: GameMapData) {
  if (started) {
    if (mapData) {
      go("game", { mapData });
    }
    return;
  }
  started = true;

  kaboom({
    global: true,
    canvas: document.getElementById("game") as HTMLCanvasElement,
    width: 960,
    height: 540,
    background: [203, 232, 255],
    scale: 1,
  });
  debug.inspect = true;
  debug.showArea = true;
  /* ================= SPRITES ================= */

  loadSprite("player-idle", "/sprites/player/Idle.png", {
    sliceX: 8,
    anims: {
      idle: { from: 0, to: 7, speed: 15, loop: true },
    },
  });

  loadSprite("player-run", "/sprites/player/Run.png", {
    sliceX: 6,
    anims: {
      run: { from: 0, to: 5, speed: 10, loop: true },
    },
  });

  loadSprite("player-attack", "/sprites/player/Attack.png", {
    sliceX: 4,
    anims: {
      attack: { from: 0, to: 3, speed: 12 },
    },
  });

  TILE_DEFS.forEach((tile) => {
    loadSprite(tile.name, tile.image);
  });

  /* ================= MAP ================= */

  function loadMap(): GameMapData | null {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return null;

    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function findSpawn(grid: number[][], size: number) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (isWalkableTile(grid[y][x])) {
          return vec2(x * size + size / 2, y * size + size / 2);
        }
      }
    }
    return vec2(64, 64);
  }

  function drawTiles(grid: number[][], tileSize: number) {
    const scaleFactor = tileSize / TILE_SPRITE_SIZE;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        const tileId = grid[y][x];
        const tileDef = getTileDef(tileId);
        if (!tileDef) continue;
        add([
          sprite(tileDef.name),
          pos(x * tileSize, y * tileSize),
          anchor("topleft"),
          scale(scaleFactor),
          tileDef.kind === "abyssWall" ? "abyss-wall" : "ground",
        ]);
      }
    }
  }

  /* ================= SCENE ================= */

  scene("game", (data?: { mapData?: GameMapData }) => {
    const resolvedMap = data?.mapData ?? loadMap();
    if (!resolvedMap?.grid) {
      add([text("NO MAP FOUND"), pos(center()), anchor("center")]);
      return;
    }

    const tileSize = resolvedMap.tileSize || TILE;
    const spawnPos = findSpawn(resolvedMap.grid, tileSize);
    drawTiles(resolvedMap.grid, tileSize);

    /* ================= PLAYER ================= */

    const player = add([
      sprite("player-idle", { anim: "idle" }),
      pos(spawnPos),
      area({ shape: new Rect(vec2(0), 65, 70) }),
      anchor("center"),
      {
        speed: 200,
        facing: 1, // 1 right, -1 left
        attacking: false,
      },
      scale(0.5),
      "player",
    ]);

    const playTarget = loadPlayTarget();
    const playState = loadPlayState();
    const worldMatch =
      !playTarget?.worldId ||
      !resolvedMap.worldId ||
      playTarget.worldId === resolvedMap.worldId;
    if (
      playTarget &&
      worldMatch &&
      !playTarget.found &&
      Number.isFinite(playTarget.x) &&
      Number.isFinite(playTarget.y) &&
      isWalkableTile(resolvedMap.grid[playTarget.y]?.[playTarget.x] ?? 0)
    ) {
      const keyPos = vec2(
        playTarget.x * tileSize + tileSize / 2,
        playTarget.y * tileSize + tileSize / 2
      );
      const keyObj = add([
        rect(tileSize * 0.6, tileSize * 0.6),
        pos(keyPos),
        area(),
        anchor("center"),
        color(250, 210, 72),
        "key",
      ]);
      let keyFound = false;
      player.onCollide("key", () => {
        if (keyFound) return;
        keyFound = true;
        keyObj.destroy();
        markKeyFound(playTarget, playState?.playId);
      });
    }

    onUpdate(() => camPos(player.pos));

    /* ================= INPUT STATE ================= */

    let moveDir = vec2(0, 0);
    let isFalling = false;

    function handleFallDeath() {
      if (isFalling) return;
      isFalling = true;
      go("game", { mapData: resolvedMap });
    }

    onKeyDown("a", () => {
      moveDir.x = -1;
      player.facing = -1;
    });

    onKeyDown("d", () => {
      moveDir.x = 1;
      player.facing = 1;
    });

    onKeyDown("w", () => (moveDir.y = -1));
    onKeyDown("s", () => (moveDir.y = 1));

    /* ================= MOVE ================= */

    function getTileIdAt(pos: Vec2) {
      const x = Math.floor(pos.x / tileSize);
      const y = Math.floor(pos.y / tileSize);
      if (y < 0 || y >= resolvedMap.grid.length) return null;
      if (x < 0 || x >= (resolvedMap.grid[y]?.length ?? 0)) return null;
      const value = resolvedMap.grid[y]?.[x];
      return typeof value === "number" ? value : null;
    }

    function canMove(pos: Vec2) {
      const tileId = getTileIdAt(pos);
      if (tileId === null) return true;
      if (!isTileDefined(tileId)) return true;
      return isWalkableTile(tileId);
    }

    /* ================= ATTACK ================= */

    function spawnAttackHitbox() {
      add([
        pos(player.pos.x + player.facing * 22, player.pos.y),
        area({ shape: new Rect(vec2(0), 20, 40) }),
        anchor("center"),
        lifespan(0.1),
        "attack",
      ]);
    }

    function attack() {
      if (player.attacking) return;

      player.attacking = true;

      player.use(sprite("player-attack"));
      player.play("attack");

      wait(0.1, spawnAttackHitbox);

      wait(0.45, () => {
        player.attacking = false;
      });
    }

    onKeyPress("space", attack);

    /* ================= UPDATE LOOP ================= */

    player.onUpdate(() => {
      /* ---- MOVE ---- */
      if (!player.attacking && moveDir.len() > 0) {
        const next = player.pos.add(moveDir.unit().scale(player.speed * dt()));
        if (canMove(next)) player.pos = next;
      }

      /* ---- FLIP (1 nơi duy nhất) ---- */
      const currentTile = getTileIdAt(player.pos);
      if (currentTile === null || !isTileDefined(currentTile)) {
        handleFallDeath();
        return;
      }

      player.flipX = player.facing === -1;

      /* ---- ANIMATION FSM ---- */
      if (player.attacking) {
        moveDir = vec2(0, 0);
        return;
      }

      if (moveDir.len() > 0) {
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

      /* ---- RESET INPUT ---- */
      moveDir = vec2(0, 0);
    });
  });

  if (mapData) {
    go("game", { mapData });
  } else {
    go("game");
  }
}

function loadPlayState(): { playId?: string } | null {
  const raw = localStorage.getItem(PLAY_STATE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function loadPlayTarget(): {
  x: number;
  y: number;
  found?: boolean;
  worldId?: string;
} | null {
  const raw = localStorage.getItem(PLAY_TARGET_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(error);
    return null;
  }
}

function markKeyFound(target: { x: number; y: number }, playId?: string) {
  localStorage.setItem(
    PLAY_TARGET_KEY,
    JSON.stringify({ ...target, found: true })
  );
  window.dispatchEvent(
    new CustomEvent("game:key-found", { detail: { playId } })
  );
}
