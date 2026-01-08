import { Link } from "react-router-dom";
import { ConnectButton } from "@mysten/dapp-kit";
import {
  ADMIN_CAP_ID,
  PACKAGE_ID,
  SUI_RPC_URL,
  WORLD_REGISTRY_ID,
} from "../chain/config";
import "./LandingPage.css";

const features = [
  {
    title: "Stone chunks",
    description: "Mint 8x8 rock tiles as NFTs and attach new floating islands.",
  },
  {
    title: "Carve and paint",
    description: "Edit tiles live, set images, and keep ownership on-chain.",
  },
  {
    title: "Play together",
    description: "Jump into the game and explore the skyworld as it grows.",
  },
];

function trimMiddle(value) {
  if (!value) return "not set";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export default function LandingPage() {
  const stats = [
    { label: "Package", value: trimMiddle(PACKAGE_ID) },
    { label: "Admin cap", value: trimMiddle(ADMIN_CAP_ID) },
    { label: "Registry", value: trimMiddle(WORLD_REGISTRY_ID) },
    { label: "RPC", value: trimMiddle(SUI_RPC_URL) },
  ];

  return (
    <div className="landing">
      <div className="landing__bg">
        <span className="landing__sky" />
        <span className="landing__sun" />
        <span className="landing__cloud landing__cloud--a" />
        <span className="landing__cloud landing__cloud--b" />
        <span className="landing__cloud landing__cloud--c" />
        <span className="landing__mist" />
      </div>

      <div className="landing__content">
        <header className="landing__nav landing__reveal" style={{ "--delay": "0s" }}>
          <div className="brand">
            <div className="brand__mark">CW</div>
            <div>
              <div className="brand__name">Chunk World</div>
              <div className="brand__tag">Sui map builder</div>
            </div>
          </div>

          <nav className="landing__links">
            <Link to="/editor">Editor</Link>
            <Link to="/game">Play</Link>
            <Link to="/payment">Checkout</Link>
          </nav>

          <div className="wallet-connect-btn">
            <ConnectButton />
          </div>
        </header>

        <section className="landing__hero">
          <div className="hero__copy">
            <div
              className="hero__badge landing__reveal"
              style={{ "--delay": "0.08s" }}
            >
              <span className="badge__dot" />
              <span>Cloud-born chunks, owned by players</span>
            </div>

            <h1 className="hero__title landing__reveal" style={{ "--delay": "0.12s" }}>
              Build a skyworld, one{" "}
              <span className="hero__accent">stone chunk</span> at a time.
            </h1>

            <p className="hero__subtitle landing__reveal" style={{ "--delay": "0.16s" }}>
              Claim rocky chunks, carve tiles, and trade them as NFTs. Every
              update lands on Sui and appears instantly in the game loop.
            </p>

            <div className="hero__cta landing__reveal" style={{ "--delay": "0.2s" }}>
              <Link className="btn btn--solid" to="/editor">
                Open editor
              </Link>
              <Link className="btn btn--ghost" to="/game">
                Launch game
              </Link>
            </div>

            <div className="hero__features">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="feature landing__reveal"
                  style={{ "--delay": `${0.24 + index * 0.06}s` }}
                >
                  <div className="feature__title">{feature.title}</div>
                  <div className="feature__desc">{feature.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="hero__panel landing__reveal" style={{ "--delay": "0.18s" }}>
            <div className="panel__header">
              <div>
                <div className="panel__eyebrow">Sky chain</div>
                <div className="panel__title">Floating World Testnet</div>
              </div>
              <div className="panel__tag">Sui</div>
            </div>

            <div className="panel__preview">
              <span className="preview__cloud preview__cloud--a" />
              <span className="preview__cloud preview__cloud--b" />
              <div className="preview__chunk">
                <div className="preview__chunk-top" />
                <div className="preview__chunk-face" />
              </div>
              <div className="preview__chunk-shadow" />
            </div>

            <div className="panel__stats">
              {stats.map((item) => (
                <div key={item.label} className="panel__stat">
                  <span>{item.label}</span>
                  <span>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <footer className="landing__footer landing__reveal" style={{ "--delay": "0.32s" }}>
          <div>Build together. Own your map. Play on Sui.</div>
          <div className="landing__foot-links">
            <Link to="/editor">Start building</Link>
            <Link to="/game">Play now</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
