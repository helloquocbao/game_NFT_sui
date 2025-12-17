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
  });

  scene("game", () => {
    const map = [
      "############################",
      "#............^.............#",
      "#..........................#",
      "#..............######......#",
      "#..............^...........#",
      "#..........................#",
      "############################",
    ];

    addLevel(map, {
      tileWidth: TILE,
      tileHeight: TILE,
      tiles: {
        "#": () => [
          rect(TILE, TILE),
          color(120, 120, 120),
          area(),
          body({ isStatic: true }),
        ],
        ".": () => [rect(TILE, TILE), color(30, 30, 30)],
        "^": () => [rect(TILE, TILE), color(255, 0, 0), area(), "trap"],
      },
    });

    const player = add([
      rect(24, 24),
      pos(64, 64),
      color(0, 200, 255),
      area(),
      body({ gravityScale: 0 }),
      anchor("center"),
      {
        speed: 200,
        hp: 3,
        spawnPos: vec2(64, 64),
        invincible: false,
        inDanger: false,
        damageTimer: 0,
        lastHitTime: 0,
      },
      "player",
    ]);

    function respawnPlayer() {
      player.hp = 3;
      player.pos = player.spawnPos.clone();
    }

    function damagePlayer(from?: GameObj) {
      if (player.invincible) return;

      player.hp -= 1;
      console.log("HP:", player.hp);

      player.invincible = true;

      // 🔁 NHẤP NHÁY
      player.opacity = 0.5;

      // 💥 KNOCKBACK
      if (from) {
        const dir = player.pos.sub(from.pos).unit();
        player.move(dir.scale(300));
      }

      wait(0.5, () => {
        player.invincible = false;
        player.opacity = 1;
      });

      if (player.hp <= 0) {
        respawnPlayer();
      }
    }

    function spawnEnemy(x: number, y: number) {
      const enemy = add([
        rect(24, 24),
        pos(x, y),
        color(255, 80, 80),
        area(),
        body({ gravityScale: 0 }),
        anchor("center"),
        { speed: 100, dir: 1 },
        "enemy",
      ]);

      enemy.onUpdate(() => {
        enemy.move(enemy.speed * enemy.dir, 0);
        if (time() % 2 < 0.02) enemy.dir *= -1;
      });

      return enemy;
    }

    spawnEnemy(200, 200);

    player.onCollideUpdate("enemy", (e) => {
      player.inDanger = true;
      dangerSource = e;

      // 💥 HIT NGAY
      if (time() - player.lastHitTime > 1) {
        damagePlayer(e);
        player.lastHitTime = time();
      }
    });

    player.onCollideUpdate("trap", (e) => {
      player.inDanger = true;
      dangerSource = null;

      // 💥 HIT NGAY
      if (time() - player.lastHitTime > 1) {
        damagePlayer(e);
        player.lastHitTime = time();
      }
    });

    let dangerSource: GameObj | null = null;

    player.onUpdate(() => {
      if (!player.inDanger) {
        player.damageTimer = 0;
        return;
      }

      player.damageTimer += dt();

      if (player.damageTimer >= 1) {
        damagePlayer(dangerSource ?? undefined);
        player.damageTimer = 0;
      }

      // reset cho frame sau
      player.inDanger = false;
    });

    onKeyDown("a", () => player.move(-player.speed, 0));
    onKeyDown("d", () => player.move(player.speed, 0));
    onKeyDown("w", () => player.move(0, -player.speed));
    onKeyDown("s", () => player.move(0, player.speed));

    // 🎥 CAMERA FOLLOW
    onUpdate(() => {
      camPos(player.pos);
    });
  });

  go("game");
}
