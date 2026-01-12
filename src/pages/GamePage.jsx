import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { sha3_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import {
  PACKAGE_ID,
  RANDOM_OBJECT_ID,
  REWARD_COIN_TYPE,
  REWARD_VAULT_ID,
  WORLD_REGISTRY_ID,
} from "../chain/config";
import { suiClient } from "../chain/suiClient";
import { startGame } from "../game/start";
import { isWalkableTile, normalizeTileId } from "../game/tiles";
import "./GamePage.css";

const TILE_SIZE = 32;
const CHUNK_SIZE = 8;
const PLAY_FEE = 5n;
const PLAY_STATE_KEY = "PLAY_STATE";
const PLAY_TARGET_KEY = "PLAY_TARGET";

export default function GamePage() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();
  const [worldId, setWorldId] = useState("");
  const [worldList, setWorldList] = useState([]);
  const [worldListError, setWorldListError] = useState("");
  const [isWorldListLoading, setIsWorldListLoading] = useState(false);
  const [selectedWorldId, setSelectedWorldId] = useState("");
  const [mapLoadError, setMapLoadError] = useState("");
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [loadedChunks, setLoadedChunks] = useState(null);
  const [rewardBalance, setRewardBalance] = useState("0");
  const [playId, setPlayId] = useState("");
  const [playKeyHex, setPlayKeyHex] = useState("");
  const [playNotice, setPlayNotice] = useState("");
  const [playError, setPlayError] = useState("");
  const [claimError, setClaimError] = useState("");
  const [claimCheckMessage, setClaimCheckMessage] = useState("");
  const [isKeyFound, setIsKeyFound] = useState(false);
  const [isPlayBusy, setIsPlayBusy] = useState(false);
  const [isClaimBusy, setIsClaimBusy] = useState(false);
  const [isClaimCheckBusy, setIsClaimCheckBusy] = useState(false);

  useEffect(() => {
    startGame();
    handletests();
  }, []);

  const handletests = async () => {
    const txBlock = await suiClient.getTransactionBlock({
      digest: "B7GqNSUhjSyS6qkSuMH6RgEC4GTetWuCiYMqErwX4kG8",
      options: { showEvents: true },
    });
    console.log(txBlock);
  };

  useEffect(() => {
    const stored = loadPlayState();
    const target = loadPlayTarget();
    if (stored) {
      setPlayId(stored.playId);
      setPlayKeyHex(stored.keyHex);
    }
    setIsKeyFound(Boolean(target?.found));
  }, []);

  useEffect(() => {
    const handler = () => setIsKeyFound(true);
    window.addEventListener("game:key-found", handler);
    return () => window.removeEventListener("game:key-found", handler);
  }, []);

  useEffect(() => {
    if (!playId || !PACKAGE_ID) {
      setClaimCheckMessage("");
      setIsClaimCheckBusy(false);
      return;
    }

    let isActive = true;
    setClaimCheckMessage("Checking reward status on-chain...");
    setIsClaimCheckBusy(true);

    void (async () => {
      try {
        const claimed = await hasRewardBeenClaimed(playId);
        if (!isActive) return;
        if (claimed) {
          resetPlayState("Reward already claimed on-chain.");
          setClaimCheckMessage("This play already has a claim recorded.");
        } else {
          setClaimCheckMessage("No claim event found yet for this play.");
        }
      } catch (error) {
        if (!isActive) return;
        setClaimCheckMessage(
          error instanceof Error ? error.message : String(error)
        );
      } finally {
        if (isActive) {
          setIsClaimCheckBusy(false);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [playId]);

  useEffect(() => {
    void (async () => {
      const id = await loadWorldId();
      await loadWorldList(id);
    })();
  }, [WORLD_REGISTRY_ID]);

  useEffect(() => {
    if (!selectedWorldId && worldId) {
      setSelectedWorldId(worldId);
    }
  }, [worldId, selectedWorldId]);

  useEffect(() => {
    void loadRewardBalance();
  }, [account?.address]);

  const worldListOptions = useMemo(() => {
    const ids = new Set();
    if (worldId) ids.add(worldId);
    worldList.forEach((id) => ids.add(id));
    return Array.from(ids);
  }, [worldId, worldList]);
  const isWalletBusy = isPending || isPlayBusy || isClaimBusy;

  async function loadWorldId() {
    setWorldListError("");
    if (!WORLD_REGISTRY_ID) {
      setWorldId("");
      return "";
    }

    try {
      const result = await suiClient.getObject({
        id: WORLD_REGISTRY_ID,
        options: { showContent: true },
      });

      const content = result.data?.content;
      if (!content || content.dataType !== "moveObject") {
        setWorldId("");
        return "";
      }

      const fields = normalizeMoveFields(content.fields);
      const worldField =
        fields.world_id ?? fields.worldId ?? fields.world ?? undefined;
      if (!worldField) {
        setWorldId("");
        return "";
      }

      const optionFields = normalizeMoveFields(worldField);
      const vec = optionFields.vec;
      const id = Array.isArray(vec) && vec.length > 0 ? String(vec[0]) : "";
      setWorldId(id);
      return id;
    } catch (error) {
      setWorldListError(error instanceof Error ? error.message : String(error));
      setWorldId("");
      return "";
    }
  }

  async function loadWorldList(registryId) {
    setWorldListError("");
    setIsWorldListLoading(true);

    try {
      const ids = new Set();
      if (registryId) ids.add(registryId);

      if (PACKAGE_ID) {
        const eventType = `${PACKAGE_ID}::world::WorldCreatedEvent`;
        let cursor = null;
        let hasNextPage = true;
        let rounds = 0;

        while (hasNextPage && rounds < 6) {
          const page = await suiClient.queryEvents({
            query: { MoveEventType: eventType },
            cursor: cursor ?? undefined,
            limit: 50,
            order: "descending",
          });

          for (const event of page.data) {
            const parsed = event.parsedJson;
            if (!parsed || typeof parsed !== "object") continue;
            const record = parsed;
            const id =
              typeof record.world_id === "string"
                ? record.world_id
                : typeof record.worldId === "string"
                ? record.worldId
                : "";
            if (id) ids.add(id);
          }

          cursor = page.nextCursor ?? null;
          hasNextPage = page.hasNextPage;
          rounds += 1;
        }
      }

      setWorldList(Array.from(ids));
    } catch (error) {
      setWorldListError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorldListLoading(false);
    }
  }

  async function loadRewardBalance() {
    if (!account?.address || !REWARD_COIN_TYPE) {
      setRewardBalance("0");
      return;
    }

    try {
      const coins = await suiClient.getCoins({
        owner: account.address,
        coinType: REWARD_COIN_TYPE,
      });
      const total = coins.data.reduce(
        (sum, coin) => sum + BigInt(coin.balance),
        0n
      );
      setRewardBalance(total.toString());
    } catch (error) {
      console.error(error);
      setRewardBalance("0");
    }
  }

  async function getPlayableCoin() {
    if (!account?.address || !REWARD_COIN_TYPE) return null;
    const coins = await suiClient.getCoins({
      owner: account.address,
      coinType: REWARD_COIN_TYPE,
    });
    return coins.data.find((coin) => BigInt(coin.balance) >= PLAY_FEE) ?? null;
  }

  function storePlayState(nextState) {
    localStorage.setItem(PLAY_STATE_KEY, JSON.stringify(nextState));
  }

  function loadPlayState() {
    const raw = localStorage.getItem(PLAY_STATE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function clearPlayState() {
    localStorage.removeItem(PLAY_STATE_KEY);
    localStorage.removeItem(PLAY_TARGET_KEY);
  }

  function resetPlayState(nextNotice) {
    clearPlayState();
    setPlayId("");
    setPlayKeyHex("");
    setIsKeyFound(false);
    if (nextNotice) {
      setPlayNotice(nextNotice);
    }
  }

  function storePlayTarget(target) {
    localStorage.setItem(PLAY_TARGET_KEY, JSON.stringify(target));
  }

  function loadPlayTarget() {
    const raw = localStorage.getItem(PLAY_TARGET_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  function reloadGameFromStorage() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      startGame(parsed);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadWorldMap(targetWorldId) {
    setMapLoadError("");
    setIsMapLoading(true);
    setLoadedChunks(null);

    try {
      const fieldEntries = await fetchAllDynamicFields(targetWorldId);
      if (fieldEntries.length === 0) {
        setMapLoadError("World has no chunks yet.");
        setLoadedChunks(0);
        return;
      }

      const chunkEntries = await resolveChunkEntries(
        targetWorldId,
        fieldEntries
      );
      if (chunkEntries.length === 0) {
        setMapLoadError("No chunk entries found.");
        setLoadedChunks(0);
        return;
      }

      const chunkIds = chunkEntries.map((entry) => entry.chunkId);
      const chunkObjects = await suiClient.multiGetObjects({
        ids: chunkIds,
        options: { showContent: true },
      });

      const maxCx = Math.max(...chunkEntries.map((entry) => entry.cx));
      const maxCy = Math.max(...chunkEntries.map((entry) => entry.cy));
      const width = (maxCx + 1) * CHUNK_SIZE;
      const height = (maxCy + 1) * CHUNK_SIZE;

      const newGrid = Array(height)
        .fill(0)
        .map(() => Array(width).fill(0));

      chunkEntries.forEach((entry, index) => {
        const response = chunkObjects[index];
        const content = response.data?.content;
        if (!content || content.dataType !== "moveObject") return;
        const fields = normalizeMoveFields(content.fields);
        const tiles = normalizeMoveVector(fields.tiles).map((tile) =>
          normalizeTileId(clampU8(parseU32Value(tile) ?? 0, 255))
        );

        for (let y = 0; y < CHUNK_SIZE; y++) {
          for (let x = 0; x < CHUNK_SIZE; x++) {
            const idx = y * CHUNK_SIZE + x;
            newGrid[entry.cy * CHUNK_SIZE + y][entry.cx * CHUNK_SIZE + x] =
              tiles[idx] ?? 0;
          }
        }
      });

      const mapData = {
        tileSize: TILE_SIZE,
        width,
        height,
        grid: newGrid,
        worldId: targetWorldId,
      };
      localStorage.setItem("CUSTOM_MAP", JSON.stringify(mapData));
      startGame(mapData);
      setLoadedChunks(chunkEntries.length);
    } catch (error) {
      setMapLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMapLoading(false);
    }
  }

  function pickKeyTarget() {
    const raw = localStorage.getItem("CUSTOM_MAP");
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const grid = Array.isArray(parsed.grid) ? parsed.grid : [];
      const floors = [];
      for (let y = 0; y < grid.length; y += 1) {
        const row = grid[y] ?? [];
        for (let x = 0; x < row.length; x += 1) {
          if (isWalkableTile(Number(row[x]))) {
            floors.push({ x, y });
          }
        }
      }
      if (!floors.length) return null;
      return floors[Math.floor(Math.random() * floors.length)];
    } catch (error) {
      console.error(error);
      return null;
    }
  }

  async function handlePlayOnChain() {
    setPlayError("");
    setPlayNotice("");
    setClaimError("");

    if (!account?.address) {
      setPlayError("Connect wallet first.");
      return;
    }
    if (!PACKAGE_ID || !REWARD_VAULT_ID) {
      setPlayError("Missing package or reward vault id.");
      return;
    }
    const activeWorldId = selectedWorldId || worldId;
    if (!activeWorldId) {
      setPlayError("Select a world first.");
      return;
    }

    const playableCoin = await getPlayableCoin();
    if (!playableCoin) {
      setPlayError("Need at least 5 CHUNK coin to play.");
      return;
    }

    const keyBytes = new Uint8Array(16);
    crypto.getRandomValues(keyBytes);
    const sealBytes = sha3_256(keyBytes);
    const sealVector = Array.from(sealBytes);
    const keyHex = bytesToHex(keyBytes);

    setIsPlayBusy(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::world::play`,
        arguments: [
          tx.object(activeWorldId),
          tx.object(REWARD_VAULT_ID),
          tx.object(playableCoin.coinObjectId),
          tx.pure.vector("u8", sealVector),
        ],
      });

      const result = await signAndExecute({ transaction: tx });
      console.log("result", result);
      const txBlock = await suiClient.getTransactionBlock({
        digest: result.digest,
        options: { showEvents: true },
      });
      console.log("txBlock", txBlock);
      const eventType = `${PACKAGE_ID}::world::PlayCreatedEvent`;
      console.log("eventType", eventType);
      const playEvent = txBlock.events?.find(
        (event) => event.type === eventType
      );
      console.log("playEvent", playEvent);
      const parsed = playEvent?.parsedJson ?? {};
      const nextPlayId =
        typeof parsed.play_id === "string"
          ? parsed.play_id
          : typeof parsed.play_id === "number"
          ? String(parsed.play_id)
          : "";
      console.log("nextPlayId", nextPlayId);
      if (!nextPlayId) {
        setPlayError("Play created but play_id not found.");
        return;
      }

      const target = pickKeyTarget();
      if (target) {
        storePlayTarget({ ...target, worldId: activeWorldId, found: false });
      }

      storePlayState({
        playId: nextPlayId,
        keyHex,
        worldId: activeWorldId,
        found: false,
      });
      setPlayId(nextPlayId);
      setPlayKeyHex(keyHex);
      setIsKeyFound(false);
      reloadGameFromStorage();
      setPlayNotice(
        target
          ? `Key hidden at tile (${target.x}, ${target.y}).`
          : "Key generated. Load a map to hide it."
      );
      await loadRewardBalance();
    } catch (error) {
      setPlayError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsPlayBusy(false);
    }
  }

  async function handleClaimOnChain() {
    setClaimError("");
    setPlayNotice("");

    if (!account?.address) {
      setClaimError("Connect wallet first.");
      return;
    }
    if (!PACKAGE_ID || !REWARD_VAULT_ID || !RANDOM_OBJECT_ID) {
      setClaimError("Missing chain config for claim.");
      return;
    }
    if (!playId || !playKeyHex) {
      setClaimError("No active play found.");
      return;
    }
    if (!isKeyFound) {
      setClaimError("Find the hidden key in game first.");
      return;
    }

    const activeWorldId = selectedWorldId || worldId;
    if (!activeWorldId) {
      setClaimError("Select a world first.");
      return;
    }

    const keyBytes = Array.from(hexToBytes(playKeyHex));

    setIsClaimBusy(true);
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::world::claim_reward`,
        arguments: [
          tx.object(activeWorldId),
          tx.object(REWARD_VAULT_ID),
          tx.object(RANDOM_OBJECT_ID),
          tx.pure.u64(BigInt(playId)),
          tx.pure.vector("u8", keyBytes),
        ],
      });

      const result = await signAndExecute({ transaction: tx });
      const txBlock = await suiClient.getTransactionBlock({
        digest: result.digest,
        options: { showEvents: true },
      });
      const eventType = `${PACKAGE_ID}::world::RewardClaimedEvent`;
      const rewardEvent = txBlock.events?.find(
        (event) => event.type === eventType
      );
      const parsed = rewardEvent?.parsedJson ?? {};
      const rewardValue =
        typeof parsed.reward === "string"
          ? parsed.reward
          : typeof parsed.reward === "number"
          ? String(parsed.reward)
          : "";

      resetPlayState(
        rewardValue ? `Claimed ${rewardValue} CHUNK.` : "Claimed reward."
      );
      await loadRewardBalance();
    } catch (error) {
      setClaimError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsClaimBusy(false);
    }
  }

  async function handleVerifyClaimStatus() {
    setClaimError("");

    if (!playId) {
      setClaimCheckMessage("No active play to verify.");
      return;
    }
    if (!PACKAGE_ID) {
      setClaimCheckMessage("Missing package id for event search.");
      return;
    }
    if (isClaimCheckBusy) return;

    setClaimCheckMessage("Checking reward status on-chain...");
    setIsClaimCheckBusy(true);
    try {
      const claimed = await hasRewardBeenClaimed(playId);
      if (claimed) {
        resetPlayState("Reward already claimed on-chain.");
        setClaimCheckMessage("Reward was already claimed for that play.");
      } else {
        setClaimCheckMessage("No claim event found yet for this play.");
      }
    } catch (error) {
      setClaimCheckMessage(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setIsClaimCheckBusy(false);
    }
  }

  function handleLoadWorld() {
    if (!selectedWorldId) {
      setMapLoadError("Select a world to load.");
      return;
    }
    void loadWorldMap(selectedWorldId);
  }

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
            <div className="game-info__title">World</div>
            <div className="game-field">
              <label>World id</label>
              <select
                value={selectedWorldId}
                onChange={(event) => setSelectedWorldId(event.target.value)}
                disabled={isWorldListLoading}
              >
                <option value="">
                  {worldListOptions.length > 0
                    ? "Select world"
                    : "No worlds found"}
                </option>
                {worldListOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>
            <button
              className="game-btn game-btn--primary"
              onClick={handleLoadWorld}
              disabled={isMapLoading || !selectedWorldId}
            >
              {isMapLoading ? "Loading..." : "Load world"}
            </button>
            {loadedChunks !== null && (
              <div className="game-info__note">
                Loaded {loadedChunks} chunks.
              </div>
            )}
            {worldListError && (
              <div className="game-info__error">{worldListError}</div>
            )}
            {mapLoadError && (
              <div className="game-info__error">{mapLoadError}</div>
            )}

            <div className="game-info__title">Wallet</div>
            <div className="game-info__card">
              <span>Reward balance</span>
              <span>{rewardBalance}</span>
            </div>
            <ConnectButton />

            <div className="game-info__title">Rewards</div>
            <div className="game-info__card">
              <span>Play id</span>
              <span>{playId || "-"}</span>
            </div>
            <div className="game-info__card">
              <span>Key status</span>
              <span>{isKeyFound ? "found" : playId ? "hidden" : "-"}</span>
            </div>
            <button
              className="game-btn game-btn--primary"
              onClick={handlePlayOnChain}
              disabled={isWalletBusy || !account?.address}
            >
              {isPlayBusy ? "Starting..." : "Start play (5 coin)"}
            </button>
            <button
              className="game-btn"
              onClick={handleClaimOnChain}
              disabled={!playId || !isKeyFound || isWalletBusy}
            >
              {isClaimBusy ? "Claiming..." : "Claim reward"}
            </button>
            <button
              className="game-btn"
              onClick={handleVerifyClaimStatus}
              disabled={!playId || isWalletBusy || isClaimCheckBusy}
            >
              {isClaimCheckBusy ? "Checking..." : "Verify claim status"}
            </button>
            {playNotice && <div className="game-info__note">{playNotice}</div>}
            {playError && <div className="game-info__error">{playError}</div>}
            {claimError && <div className="game-info__error">{claimError}</div>}
            {claimCheckMessage && (
              <div className="game-info__note">{claimCheckMessage}</div>
            )}

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
              Select a world and load the map to start exploring.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function normalizeMoveFields(value) {
  if (!value || typeof value !== "object") return {};
  const record = value;
  if (record.fields && typeof record.fields === "object") {
    return record.fields;
  }
  return record;
}

function normalizeMoveVector(value) {
  if (Array.isArray(value)) return value;
  const fields = normalizeMoveFields(value);
  if (Array.isArray(fields.vec)) return fields.vec;
  return [];
}

function parseU32Value(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return null;
}

function clampU8(value, max) {
  const clamped = Math.max(0, Math.min(max, value));
  return Number.isFinite(clamped) ? clamped : 0;
}

function extractObjectId(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value;
  if (typeof record.id === "string") return record.id;
  if (record.id && typeof record.id === "object") {
    const nested = record.id;
    if (typeof nested.id === "string") return nested.id;
  }
  if (record.fields && typeof record.fields === "object") {
    const fields = record.fields;
    if (typeof fields.id === "string") return fields.id;
    if (fields.id && typeof fields.id === "object") {
      const nested = fields.id;
      if (typeof nested.id === "string") return nested.id;
    }
  }

  return "";
}

function extractChunkCoords(value) {
  const fields = normalizeMoveFields(value);
  const cx = parseU32Value(fields.cx);
  const cy = parseU32Value(fields.cy);
  if (cx === null || cy === null) return null;
  return { cx, cy };
}

async function fetchAllDynamicFields(parentId) {
  const all = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const page = await suiClient.getDynamicFields({
      parentId,
      cursor: cursor ?? undefined,
      limit: 50,
    });
    all.push(...page.data);
    cursor = page.nextCursor ?? null;
    hasNextPage = page.hasNextPage;
  }

  return all;
}

async function resolveChunkEntries(worldId, fields) {
  const results = await Promise.allSettled(
    fields.map(async (field) => {
      if (field.name?.type && !field.name.type.includes("ChunkKey")) {
        return null;
      }
      const coords = extractChunkCoords(field.name?.value);
      if (!coords) return null;

      const fieldObject = await suiClient.getDynamicFieldObject({
        parentId: worldId,
        name: field.name,
      });
      const content = fieldObject.data?.content;
      if (!content || content.dataType !== "moveObject") return null;
      const fieldFields = normalizeMoveFields(content.fields);
      const chunkId = extractObjectId(fieldFields.value);
      if (!chunkId) return null;
      return { ...coords, chunkId };
    })
  );

  return results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((entry) => Boolean(entry));
}

function matchesPlayId(parsedJson, targetPlayId) {
  if (!targetPlayId || !parsedJson || typeof parsedJson !== "object") {
    return false;
  }
  const record = parsedJson;
  const candidate =
    typeof record.play_id === "string"
      ? record.play_id
      : typeof record.play_id === "number"
      ? String(record.play_id)
      : typeof record.playId === "string"
      ? record.playId
      : typeof record.playId === "number"
      ? String(record.playId)
      : "";
  return candidate === targetPlayId;
}

async function hasRewardBeenClaimed(targetPlayId) {
  if (!targetPlayId || !PACKAGE_ID) return false;
  const eventType = `${PACKAGE_ID}::world::RewardClaimedEvent`;
  let cursor = null;
  let rounds = 0;
  const limit = 50;
  const maxRounds = 6;

  while (rounds < maxRounds) {
    const page = await suiClient.queryEvents({
      query: { MoveEventType: eventType },
      cursor: cursor ?? undefined,
      limit,
      order: "descending",
    });
    const events = page.data ?? [];

    if (events.some((event) => matchesPlayId(event.parsedJson, targetPlayId))) {
      return true;
    }

    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
    rounds += 1;
  }

  return false;
}
