import { useEffect } from "react";
import { startGame } from "../game/start";

export default function GamePage() {
  useEffect(() => {
    startGame();
  }, []);

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "black",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <canvas id="game" />
    </div>
  );
}
