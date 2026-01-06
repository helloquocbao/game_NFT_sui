import { useEffect } from "react";
import { Link } from "react-router-dom";
import { startGame } from "../game/start";
import "./GamePage.css";

export default function GamePage() {
  useEffect(() => {
    startGame();
  }, []);

  return (
    <div className="game-page">
      <div className="game-bg">
        <span className="game-cloud game-cloud--a" />
        <span className="game-cloud game-cloud--b" />
        <span className="game-cloud game-cloud--c" />
        <span className="game-haze" />
      </div>

      <div className="game-shell">
        <header className="game-header">
          <div>
            <div className="game-eyebrow">Skyworld run</div>
            <h1 className="game-title">Chunk adventure</h1>
            <p className="game-subtitle">
              Test your map and feel the flow before minting.
            </p>
          </div>
          <div className="game-links">
            <Link className="game-link" to="/">
              Home
            </Link>
            <Link className="game-link" to="/editor">
              Editor
            </Link>
          </div>
        </header>

        <div className="game-stage">
          <div className="game-frame">
            <canvas id="game" />
          </div>

          <aside className="game-info">
            <div className="game-info__title">Controls</div>
            <div className="game-info__card">
              <span>Move</span>
              <span>W A S D</span>
            </div>
            <div className="game-info__card">
              <span>Attack</span>
              <span>Space</span>
            </div>
            <div className="game-info__note">
              Load a map from the editor to start exploring.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
