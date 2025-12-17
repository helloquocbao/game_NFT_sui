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
  debug.inspect = true;
  debug.showArea = true;
  loadSprite("player", "/sprites/player/Idle.png", {
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
        "^": () => [
          rect(TILE, TILE),
          color(255, 0, 0),
          area(),
          body({ isStatic: true }),
          "trap",
        ],
      },
    });

    const HITBOX_W = 20;
    const HITBOX_H = 30;

    const player = add([
      sprite("player", { anim: "idle" }),
      pos(64, 64),

      area({
        shape: new Rect(vec2(0, 0), HITBOX_W, HITBOX_H),
      }),

      body({ gravityScale: 0 }),
      anchor("center"),

      {
        speed: 200,
        hp: 3,
        facing: vec2(1, 0),
      },

      "player",
    ]);

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

      enemy.onUpdate(() => {
        enemy.move(enemy.speed * enemy.dir, 0);
        if (time() % 2 < 0.02) enemy.dir *= -1;
      });

      return enemy;
    }

    function hitPlayer(from?: GameObj, knockback = true) {
      if (player.invincible) return;

      player.hp -= 1;
      console.log("HP:", player.hp);

      player.invincible = true;
      player.opacity = 0.5;

      if (from && knockback) {
        const dir = player.pos.sub(from.pos).unit();
        player.pos = player.pos.add(dir.scale(24)); // ✅ ĐẨY TRỰC TIẾP
      }

      wait(0.5, () => {
        player.invincible = false;
        player.opacity = 1;
      });

      if (player.hp <= 0) {
        respawnPlayer();
      }
    }

    function attack() {
      const dir = player.facing;

      const hitbox = add([
        rect(20, 20),
        pos(player.pos.add(dir.scale(20))),
        area(),
        opacity(0),
        lifespan(0.1),
        "attack",
      ]);

      hitbox.onCollide("enemy", (e) => {
        e.hp -= 1;

        const knockDir = e.pos.sub(player.pos).unit();
        e.move(knockDir.scale(300));

        if (e.hp <= 0) {
          destroy(e);
        }
      });
    }

    spawnEnemy(200, 200);

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
      player.move(-player.speed, 0);
      player.facing = vec2(-1, 0);
    });
    onKeyDown("d", () => {
      player.move(player.speed, 0);
      player.facing = vec2(1, 0);
    });

    onKeyDown("w", () => player.move(0, -player.speed));
    onKeyDown("s", () => player.move(0, player.speed));
    onKeyPress("space", attack);
    // 🎥 CAMERA FOLLOW
    onUpdate(() => {
      camPos(player.pos);
    });
  });

  go("game");
}
