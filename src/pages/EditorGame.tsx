import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ConnectButton,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import {
  ADMIN_CAP_ID,
  PACKAGE_ID,
  SUI_RPC_URL,
  WORLD_REGISTRY_ID,
} from "../chain/config";
import { suiClient } from "../chain/suiClient";
import {
  DEFAULT_GROUND_TILE_ID,
  TILE_DEFS,
  getTileDef,
  normalizeTileId,
} from "../game/tiles";
import "./EditorGame.css";

/**
 * TILE CODE
 * 0 = void (fall)
 * 1.. = tilemap-slices ids (see game/tiles.ts)
 */

const TILE_SIZE = 32;
const CHUNK_SIZE = 8;
const DEFAULT_FLOOR = DEFAULT_GROUND_TILE_ID;
const VOID_TILE_COLOR = "#0b0b0b";
const USER_ID_KEY = "EDITOR_USER_ID";
const RANDOM_OBJECT_ID = "0x8";

type ChunkOwners = Record<string, string>;

export default function EditorGame() {
  const navigate = useNavigate();
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute, isPending } =
    useSignAndExecuteTransaction();

  const [userId] = useState(() => getOrCreateUserId());
  const [notice, setNotice] = useState<string>("");
  const [selectedTile, setSelectedTile] = useState<number>(DEFAULT_FLOOR);
  const [grid, setGrid] = useState<number[][]>(() => createDefaultGrid());
  const [chunkOwners, setChunkOwners] = useState<ChunkOwners>(() =>
    createOwnersForGrid(createDefaultGrid(), userId)
  );
  const [activeChunkKey, setActiveChunkKey] = useState<string>("");
  const [worldId, setWorldId] = useState<string>("");
  const [worldOverride, setWorldOverride] = useState<string>("");
  const [chainError, setChainError] = useState<string>("");
  const [worldList, setWorldList] = useState<string[]>([]);
  const [worldListError, setWorldListError] = useState("");
  const [isWorldListLoading, setIsWorldListLoading] = useState(false);
  const [txDigest, setTxDigest] = useState<string>("");
  const [txError, setTxError] = useState<string>("");
  const [busyAction, setBusyAction] = useState<string>("");
  const [isDraggingGrid, setIsDraggingGrid] = useState(false);
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [mapLoadError, setMapLoadError] = useState("");
  const [loadedChunks, setLoadedChunks] = useState<number | null>(null);

  const [claimImageUrl, setClaimImageUrl] = useState("");
  const [isChunkModalOpen, setIsChunkModalOpen] = useState(false);
  const [hoveredChunkKey, setHoveredChunkKey] = useState("");
  const [hoveredChunkId, setHoveredChunkId] = useState("");
  const [isHoverIdLoading, setIsHoverIdLoading] = useState(false);

  const chunkIdCacheRef = useRef<Record<string, string>>({});
  const hoverRequestRef = useRef(0);
  const gridWrapRef = useRef<HTMLDivElement | null>(null);
  const clickTileRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });
  const blockClickRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const id = await loadWorldId();
      await loadWorldList(id);
    })();
  }, [WORLD_REGISTRY_ID]);

  const gridWidth = grid[0]?.length ?? 0;
  const gridHeight = grid.length;
  const worldIdValue = worldOverride.trim() || worldId;
  const isConnected = Boolean(account?.address);
  const isBusy = isPending || Boolean(busyAction);
  const walletAddress = account?.address ?? "";
  const isOwnerMatch = (owner?: string) =>
    Boolean(
      owner && (owner === userId || (walletAddress && owner === walletAddress))
    );
  const worldListOptions = useMemo(
    () => worldList.filter((id) => id && id !== worldId),
    [worldList, worldId]
  );

  useEffect(() => {
    chunkIdCacheRef.current = {};
    hoverRequestRef.current = 0;
    setHoveredChunkKey("");
    setHoveredChunkId("");
    setIsHoverIdLoading(false);
  }, [worldIdValue]);

  useEffect(() => {
    if (!hoveredChunkKey) {
      setHoveredChunkId("");
      setIsHoverIdLoading(false);
      return;
    }
    if (!worldIdValue || !PACKAGE_ID) {
      setHoveredChunkId("");
      setIsHoverIdLoading(false);
      return;
    }

    const cached = chunkIdCacheRef.current[hoveredChunkKey];
    if (cached !== undefined) {
      setHoveredChunkId(cached);
      setIsHoverIdLoading(false);
      return;
    }

    const [cxRaw, cyRaw] = hoveredChunkKey.split(",");
    const cx = parseCoord(cxRaw ?? "0");
    const cy = parseCoord(cyRaw ?? "0");
    const requestId = (hoverRequestRef.current += 1);
    setIsHoverIdLoading(true);

    void (async () => {
      const resolved = await fetchChunkObjectId(cx, cy, { silent: true });
      if (requestId !== hoverRequestRef.current) return;
      chunkIdCacheRef.current[hoveredChunkKey] = resolved;
      setHoveredChunkId(resolved);
      setIsHoverIdLoading(false);
    })();
  }, [hoveredChunkKey, worldIdValue]);

  const activeChunkLabel = activeChunkKey
    ? activeChunkKey.replace(",", ", ")
    : "none";
  const activeChunkOwner = activeChunkKey
    ? chunkOwners[activeChunkKey]
    : undefined;
  const canSaveActiveChunk =
    Boolean(activeChunkKey) && isOwnerMatch(activeChunkOwner);
  const activeChunkCoords = useMemo(() => {
    if (!activeChunkKey) return null;
    const [cxRaw, cyRaw] = activeChunkKey.split(",");
    return { cx: parseCoord(cxRaw ?? "0"), cy: parseCoord(cyRaw ?? "0") };
  }, [activeChunkKey]);
  const hoveredChunkLabel = hoveredChunkKey
    ? hoveredChunkKey.replace(",", ", ")
    : "none";
  const hoveredChunkIdDisplay = !hoveredChunkKey
    ? "-"
    : !worldIdValue || !PACKAGE_ID
    ? "not available"
    : isHoverIdLoading
    ? "loading..."
    : hoveredChunkId || "not found";
  const activeChunkIdDisplay =
    activeChunkKey && activeChunkKey === hoveredChunkKey
      ? hoveredChunkIdDisplay
      : "-";

  /* ================= EDIT ================= */

  function handleTilePointerEnter(chunkKey: string, isOwned: boolean) {
    if (isDraggingGrid) return;
    if (!isOwned) {
      if (hoveredChunkKey) {
        setHoveredChunkKey("");
      }
      return;
    }
    if (hoveredChunkKey !== chunkKey) {
      setHoveredChunkKey(chunkKey);
    }
  }

  function handleTilePointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    x: number,
    y: number
  ) {
    if (event.button !== 0) return;
    clickTileRef.current = { x, y };
  }

  function paint(x: number, y: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    const chunkKey = makeChunkKey(cx, cy);
    const owner = chunkOwners[chunkKey];
    const isOwned = isOwnerMatch(owner);
    setActiveChunkKey(chunkKey);
    if (!isOwned) {
      const ownerLabel = owner ? shortAddress(owner) : "no owner";
      setNotice(`Chunk owned by ${ownerLabel}.`);
      return;
    }
    setNotice(`Editing chunk (${cx}, ${cy}).`);
    setIsChunkModalOpen(true);
  }

  function closeChunkModal() {
    setIsChunkModalOpen(false);
  }

  function paintModalTile(localX: number, localY: number) {
    if (!activeChunkCoords || !canSaveActiveChunk) return;
    const gx = activeChunkCoords.cx * CHUNK_SIZE + localX;
    const gy = activeChunkCoords.cy * CHUNK_SIZE + localY;
    setGrid((prev) => {
      if (prev[gy]?.[gx] === selectedTile) return prev;
      const copy = prev.map((row) => [...row]);
      copy[gy][gx] = selectedTile;
      return copy;
    });
  }

  function handleGridPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const wrap = gridWrapRef.current;
    if (!wrap) return;
    blockClickRef.current = false;
    dragRef.current.active = true;
    dragRef.current.moved = false;
    dragRef.current.startX = event.clientX;
    dragRef.current.startY = event.clientY;
    dragRef.current.scrollLeft = wrap.scrollLeft;
    dragRef.current.scrollTop = wrap.scrollTop;
    wrap.setPointerCapture(event.pointerId);
  }

  function handleGridPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const wrap = gridWrapRef.current;
    if (!wrap || !dragRef.current.active) return;

    const dx = event.clientX - dragRef.current.startX;
    const dy = event.clientY - dragRef.current.startY;
    const movedEnough = Math.abs(dx) > 4 || Math.abs(dy) > 4;

    if (!dragRef.current.moved && !movedEnough) return;

    if (!dragRef.current.moved) {
      dragRef.current.moved = true;
      setIsDraggingGrid(true);
    }

    event.preventDefault();
    wrap.scrollLeft = dragRef.current.scrollLeft - dx;
    wrap.scrollTop = dragRef.current.scrollTop - dy;
    blockClickRef.current = true;
  }

  function handleGridPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const wrap = gridWrapRef.current;
    if (!dragRef.current.active) return;

    dragRef.current.active = false;
    if (wrap?.hasPointerCapture(event.pointerId)) {
      wrap.releasePointerCapture(event.pointerId);
    }

    const shouldBlock = dragRef.current.moved;
    const isCancel = event.type === "pointercancel";
    const clickedTile = clickTileRef.current;
    clickTileRef.current = null;
    dragRef.current.moved = false;
    setIsDraggingGrid(false);

    if (!shouldBlock && !isCancel && clickedTile) {
      paint(clickedTile.x, clickedTile.y);
    }

    if (shouldBlock) {
      setTimeout(() => {
        blockClickRef.current = false;
      }, 0);
    } else {
      blockClickRef.current = false;
    }
  }

  function handleGridPointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    handleGridPointerEnd(event);
    setHoveredChunkKey("");
    setHoveredChunkId("");
    setIsHoverIdLoading(false);
  }

  /* ================= CHAIN IO ================= */

  async function loadWorldId(): Promise<string> {
    setChainError("");
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
      const typeName = typeof content.type === "string" ? content.type : "";
      if (typeName && !typeName.includes("WorldRegistry")) {
        setChainError(`WORLD_REGISTRY_ID is ${typeName}, not WorldRegistry.`);
      }

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
      setChainError(error instanceof Error ? error.message : String(error));
      setWorldId("");
      return "";
    }
  }

  async function refreshWorldAndMap() {
    setMapLoadError("");
    const override = worldOverride.trim();
    const registryId = await loadWorldId();
    await loadWorldList(registryId);
    const targetId = override || registryId;
    if (!targetId) {
      setMapLoadError("World id missing.");
      return;
    }
    await loadWorldMap(targetId);
  }

  async function loadWorldMap(targetWorldId: string) {
    setMapLoadError("");
    setIsMapLoading(true);
    setLoadedChunks(null);
    setActiveChunkKey("");

    try {
      const fieldEntries = await fetchAllDynamicFields(targetWorldId);
      if (fieldEntries.length === 0) {
        setNotice("World has no chunks yet.");
        setLoadedChunks(0);
        return;
      }

      const chunkEntries = await resolveChunkEntries(
        targetWorldId,
        fieldEntries
      );
      if (chunkEntries.length === 0) {
        setNotice("No chunk entries found.");
        setLoadedChunks(0);
        return;
      }

      const chunkIds = chunkEntries.map((entry) => entry.chunkId);
      const chunkObjects = await suiClient.multiGetObjects({
        ids: chunkIds,
        options: { showContent: true, showOwner: true },
      });

      const maxCx = Math.max(...chunkEntries.map((entry) => entry.cx));
      const maxCy = Math.max(...chunkEntries.map((entry) => entry.cy));
      const width = (maxCx + 1) * CHUNK_SIZE;
      const height = (maxCy + 1) * CHUNK_SIZE;

      const newGrid = Array(height)
        .fill(0)
        .map(() => Array(width).fill(0));
      const newOwners: ChunkOwners = {};

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

        const owner = extractOwnerAddress(response.data?.owner);
        if (owner) {
          newOwners[makeChunkKey(entry.cx, entry.cy)] = owner;
        }
      });

      setGrid(newGrid);
      setChunkOwners(newOwners);
      setLoadedChunks(chunkEntries.length);
      setNotice(`Loaded ${chunkEntries.length} chunks from chain.`);
    } catch (error) {
      setMapLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsMapLoading(false);
    }
  }

  async function loadWorldList(registryId?: string) {
    setWorldListError("");
    setIsWorldListLoading(true);

    try {
      const ids = new Set<string>();
      const regId = registryId ?? worldId;
      if (regId) ids.add(regId);
      const overrideId = worldOverride.trim();
      if (overrideId) ids.add(overrideId);

      if (PACKAGE_ID) {
        const eventType = `${PACKAGE_ID}::world::WorldCreatedEvent`;
        let cursor: string | null | undefined = null;
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
            const record = parsed as Record<string, unknown>;
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

      setWorldList([...ids]);
    } catch (error) {
      setWorldListError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsWorldListLoading(false);
    }
  }

  async function fetchChunkObjectId(
    cx: number,
    cy: number,
    options?: { silent?: boolean }
  ) {
    const silent = options?.silent ?? false;
    if (!silent) setTxError("");
    if (!PACKAGE_ID) {
      if (!silent) setTxError("Missing package id.");
      return "";
    }
    if (!worldIdValue) {
      if (!silent) setTxError("World id missing.");
      return "";
    }

    try {
      const result = await suiClient.getDynamicFieldObject({
        parentId: worldIdValue,
        name: {
          type: `${PACKAGE_ID}::world::ChunkKey`,
          value: { cx, cy },
        },
      });

      const content = result.data?.content;
      if (!content || content.dataType !== "moveObject") {
        if (!silent) setTxError("Chunk not found.");
        return "";
      }

      const fields = content.fields as Record<string, unknown>;
      const resolved = extractObjectId(fields.value);
      if (!resolved) {
        if (!silent) setTxError("Could not parse chunk id.");
        return "";
      }

      return resolved;
    } catch (error) {
      if (!silent) {
        setTxError(error instanceof Error ? error.message : String(error));
      }
      return "";
    }
  }

  async function runTx(
    label: string,
    build: (tx: Transaction) => void,
    onSuccess?: () => void
  ) {
    setTxError("");
    setTxDigest("");

    if (!isConnected) {
      setTxError("Connect wallet first.");
      return;
    }

    if (!PACKAGE_ID) {
      setTxError("Missing package id.");
      return;
    }

    setBusyAction(label);
    try {
      const tx = new Transaction();

      build(tx);
      const result = await signAndExecute({ transaction: tx });

      setTxDigest(result.digest);
      onSuccess?.();
    } catch (error) {
      setTxError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusyAction("");
    }
  }

  async function createWorldOnChain() {
    if (!WORLD_REGISTRY_ID || !ADMIN_CAP_ID) {
      setTxError("Missing registry or admin cap id.");
      return;
    }

    await runTx(
      "Create world",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::create_world`,
          arguments: [tx.object(WORLD_REGISTRY_ID), tx.object(ADMIN_CAP_ID)],
        });
      },
      () => loadWorldId()
    );
  }

  async function claimChunkOnChain() {
    console.log("Claim chunk on chain", worldIdValue, activeChunkKey);
    if (!worldIdValue) {
      setTxError("World id missing.");
      return;
    }

    // if (!activeChunkKey) {
    //   setTxError("Select a chunk to use as tile template.");
    //   return;
    // }

    const [cxRaw, cyRaw] = activeChunkKey.split(",");
    const cx = parseCoord(cxRaw ?? "0");
    const cy = parseCoord(cyRaw ?? "0");
    const tiles = buildChunkTiles(grid, cx, cy);
    const imageUrl = claimImageUrl.trim();

    await runTx(
      "Claim chunk",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::claim_chunk`,
          arguments: [
            tx.object(worldIdValue),
            tx.object(RANDOM_OBJECT_ID),
            tx.pure.string(imageUrl),
            tx.pure.vector("u8", tiles),
          ],
        });
      },
      () => refreshWorldAndMap()
    );
  }

  async function saveActiveChunkOnChain() {
    if (!activeChunkKey) {
      setNotice("Select a chunk first.");
      return;
    }

    const owner = chunkOwners[activeChunkKey];
    if (!isOwnerMatch(owner)) {
      setNotice(owner ? `Chunk owned by ${owner}.` : "Chunk has no owner.");
      return;
    }

    const [cxRaw, cyRaw] = activeChunkKey.split(",");
    const cx = parseCoord(cxRaw ?? "0");
    const cy = parseCoord(cyRaw ?? "0");
    const resolved = await fetchChunkObjectId(cx, cy);
    if (!resolved) return;

    const tiles = buildChunkTiles(grid, cx, cy);
    await runTx(
      "Save chunk",
      (tx) => {
        tx.moveCall({
          target: `${PACKAGE_ID}::world::set_tiles`,
          arguments: [tx.object(resolved), tx.pure.vector("u8", tiles)],
        });
      },
      () => {
        setNotice("Chunk saved on-chain.");
      }
    );
  }

  /* ================= UI ================= */

  return (
    <div className="editor-page">
      <div className="editor-shell">
        <header className="editor-header">
          <div>
            <div className="editor-eyebrow">Skyworld editor</div>
            <h1 className="editor-title">Stone chunk workshop</h1>
            <p className="editor-subtitle">
              Carve floating chunks and push updates on-chain.
            </p>
          </div>

          <div className="editor-wallet">
            <div className="wallet-connect-btn">
              <ConnectButton />
            </div>
            <div className="wallet-meta">
              <span>Wallet</span>
              <span>{shortAddress(account?.address) || "not connected"}</span>
            </div>
          </div>
        </header>

        <div className="editor-layout">
          <aside className="editor-left">
            <div className="panel">
              <div className="panel__title">Map info</div>
              <div className="panel__meta">
                <div>
                  Size: {gridWidth} x {gridHeight}
                </div>
                <div>Editing: {activeChunkLabel}</div>
              </div>

              <div className="panel__rows">
                <div>
                  <span>Hover chunk</span>
                  <span>{hoveredChunkLabel}</span>
                </div>
                <div>
                  <span>Chunk id</span>
                  <span
                    className="panel__value panel__value--wrap"
                    title={hoveredChunkId || ""}
                  >
                    {hoveredChunkIdDisplay}
                  </span>
                </div>
              </div>

              <p className="panel__desc">
                Hover your chunk to preview the id, click to edit in a modal.
              </p>

              {notice && <div className="panel__notice">{notice}</div>}
            </div>

            <div className="panel">
              <div className="panel__title">Tiles</div>
              <div className="editor-tiles">
                {TILE_DEFS.map((tile) => (
                  <TileButton
                    key={tile.id}
                    label={tile.name.replace("tile_", "")}
                    image={tile.image}
                    kind={tile.kind}
                    active={selectedTile === tile.id}
                    onClick={() => setSelectedTile(tile.id)}
                  />
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel__title">Game</div>
              <div className="editor-actions">
                <button
                  className="btn btn--dark"
                  onClick={() => navigate("/game")}
                >
                  Play
                </button>
              </div>
            </div>
          </aside>

          <section className="editor-main">
            <div className="panel panel--main">
              <div className="panel__eyebrow">Stone canvas</div>
              <div className="panel__title">Chunk grid</div>

              <div
                ref={gridWrapRef}
                className={`editor-grid-wrap ${
                  isDraggingGrid ? "is-dragging" : ""
                }`}
                onPointerDown={handleGridPointerDown}
                onPointerMove={handleGridPointerMove}
                onPointerUp={handleGridPointerEnd}
                onPointerLeave={handleGridPointerLeave}
                onPointerCancel={handleGridPointerEnd}
              >
                <div
                  className="editor-grid"
                  style={{
                    gridTemplateColumns: `repeat(${gridWidth}, ${TILE_SIZE}px)`,
                    width: gridWidth * TILE_SIZE,
                  }}
                >
                  {grid.map((row, y) =>
                    row.map((cell, x) => {
                      const chunkKey = getChunkKeyFromTile(x, y);
                      const owner = chunkOwners[chunkKey];
                      const isOwned = isOwnerMatch(owner);
                      const isSelected = isOwned && chunkKey === activeChunkKey;
                      const isLocked =
                        isChunkModalOpen &&
                        Boolean(activeChunkKey) &&
                        chunkKey !== activeChunkKey;
                      const isHovered = isOwned && chunkKey === hoveredChunkKey;

                      return (
                        <button
                          key={`${x}-${y}`}
                          className={`editor-tile ${
                            isOwned ? "is-owned" : ""
                          } ${isSelected ? "is-selected" : ""} ${
                            isLocked ? "is-locked" : ""
                          } ${isHovered ? "is-hovered" : ""}`}
                          onPointerDown={(event) =>
                            handleTilePointerDown(event, x, y)
                          }
                          onPointerEnter={() =>
                            handleTilePointerEnter(chunkKey, isOwned)
                          }
                          title={`Owner: ${owner ?? "none"}`}
                          style={{
                            ...getTileStyle(cell),
                            cursor: "pointer",
                          }}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </section>

          <aside className="editor-side">
            <div className="panel">
              <div className="panel__title">Chain config</div>
              <div className="panel__rows">
                <div>
                  <span>RPC</span>
                  <span>{shortAddress(SUI_RPC_URL) || "not set"}</span>
                </div>
                <div>
                  <span>Package</span>
                  <span>{shortAddress(PACKAGE_ID) || "missing"}</span>
                </div>
                <div>
                  <span>Admin cap</span>
                  <span>{shortAddress(ADMIN_CAP_ID) || "missing"}</span>
                </div>
                <div>
                  <span>Registry</span>
                  <span>{shortAddress(WORLD_REGISTRY_ID) || "missing"}</span>
                </div>
                <div>
                  <span>World</span>
                  <span>{shortAddress(worldId) || "not created"}</span>
                </div>
                <div>
                  <span>Chunks</span>
                  <span>{loadedChunks === null ? "-" : loadedChunks}</span>
                </div>
              </div>

              <div className="panel__field">
                <label>World list</label>
                <select
                  value={worldOverride}
                  onChange={(event) => setWorldOverride(event.target.value)}
                  disabled={isWorldListLoading}
                >
                  <option value="">
                    {worldId
                      ? `Use registry (${shortAddress(worldId)})`
                      : "Use registry (empty)"}
                  </option>
                  {worldListOptions.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>

              <div className="panel__field">
                <label>World override</label>
                <input
                  value={worldOverride}
                  onChange={(event) => setWorldOverride(event.target.value)}
                  placeholder="0x..."
                />
              </div>

              <div className="panel__actions">
                <button
                  className="btn btn--ghost"
                  onClick={refreshWorldAndMap}
                  disabled={isMapLoading}
                >
                  {isMapLoading ? "Loading map..." : "Refresh world"}
                </button>
              </div>

              {chainError && <div className="panel__error">{chainError}</div>}
              {worldListError && (
                <div className="panel__error">{worldListError}</div>
              )}
              {mapLoadError && (
                <div className="panel__error">{mapLoadError}</div>
              )}
            </div>

            <div className="panel">
              <div className="panel__title">World admin</div>
              <p className="panel__desc">
                Create the shared world object using the admin cap.
              </p>
              <button
                className="btn btn--primary"
                onClick={createWorldOnChain}
                disabled={isBusy || !isConnected}
              >
                {busyAction === "Create world" ? "Creating..." : "Create world"}
              </button>
            </div>

            <div className="panel">
              <div className="panel__title">Claim chunk</div>
              <p className="panel__desc">
                Uses tiles from the selected chunk. Location is random but must
                touch existing chunks.
              </p>
              <div className="panel__rows">
                <div>
                  <span>Selected chunk</span>
                  <span>{activeChunkLabel}</span>
                </div>
              </div>
              <div className="panel__field">
                <label>Image URL</label>
                <input
                  value={claimImageUrl}
                  onChange={(event) => setClaimImageUrl(event.target.value)}
                  placeholder="https://..."
                />
              </div>
              <button
                className="btn btn--dark"
                onClick={claimChunkOnChain}
                disabled={isBusy || !isConnected}
              >
                {busyAction === "Claim chunk" ? "Claiming..." : "Claim chunk"}
              </button>
            </div>

            <div className="panel panel--status">
              <div className="panel__title">Transaction status</div>
              <div className="panel__rows">
                <div>
                  <span>Wallet</span>
                  <span>
                    {shortAddress(account?.address) || "not connected"}
                  </span>
                </div>
                <div>
                  <span>Action</span>
                  <span>{busyAction || "idle"}</span>
                </div>
                <div>
                  <span>Digest</span>
                  <span>{txDigest || "-"}</span>
                </div>
              </div>
              {txError && <div className="panel__error">{txError}</div>}
            </div>
          </aside>
        </div>

        {isChunkModalOpen && activeChunkCoords && (
          <div className="editor-modal">
            <div className="editor-modal__backdrop" onClick={closeChunkModal} />
            <div
              className="editor-modal__panel"
              role="dialog"
              aria-modal="true"
              aria-label="Chunk editor"
            >
              <div className="editor-modal__header">
                <div>
                  <div className="panel__eyebrow">Chunk editor</div>
                  <div className="editor-modal__title">
                    Chunk {activeChunkLabel}
                  </div>
                </div>
                <button
                  className="btn btn--outline editor-modal__close"
                  onClick={closeChunkModal}
                >
                  Close
                </button>
              </div>

              {notice && <div className="panel__notice">{notice}</div>}

              <div className="panel__rows">
                <div>
                  <span>Chunk id</span>
                  <span
                    className="panel__value panel__value--wrap"
                    title={activeChunkIdDisplay}
                  >
                    {activeChunkIdDisplay}
                  </span>
                </div>
              </div>

              <div className="editor-modal__body">
                <div className="editor-modal__canvas">
                  <div
                    className="editor-chunk-grid"
                    style={{
                      gridTemplateColumns: `repeat(${CHUNK_SIZE}, ${TILE_SIZE}px)`,
                    }}
                  >
                    {Array.from({ length: CHUNK_SIZE }, (_, y) =>
                      Array.from({ length: CHUNK_SIZE }, (_, x) => {
                        const gx = activeChunkCoords.cx * CHUNK_SIZE + x;
                        const gy = activeChunkCoords.cy * CHUNK_SIZE + y;
                        const cell = grid[gy]?.[gx] ?? 0;

                        return (
                          <button
                            key={`${x}-${y}`}
                            className="editor-tile editor-tile--chunk"
                            onClick={() => paintModalTile(x, y)}
                            style={{
                              ...getTileStyle(cell),
                              cursor: "pointer",
                            }}
                          />
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="editor-modal__tiles">
                  <div className="panel__title">Tiles</div>
                  <div className="editor-tiles">
                    {TILE_DEFS.map((tile) => (
                      <TileButton
                        key={tile.id}
                        label={tile.name.replace("tile_", "")}
                        image={tile.image}
                        kind={tile.kind}
                        active={selectedTile === tile.id}
                        onClick={() => setSelectedTile(tile.id)}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="editor-modal__actions">
                <button
                  className="btn btn--primary"
                  onClick={saveActiveChunkOnChain}
                  disabled={isBusy || !isConnected || !canSaveActiveChunk}
                >
                  {busyAction === "Save chunk" ? "Saving..." : "Save chunk"}
                </button>
                <button className="btn btn--outline" onClick={closeChunkModal}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================= HELPERS ================= */

function getOrCreateUserId() {
  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) return stored;
  const generated = `user_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(USER_ID_KEY, generated);
  return generated;
}

function makeChunkKey(cx: number, cy: number) {
  return `${cx},${cy}`;
}

function getChunkKeyFromTile(x: number, y: number) {
  const cx = Math.floor(x / CHUNK_SIZE);
  const cy = Math.floor(y / CHUNK_SIZE);
  return makeChunkKey(cx, cy);
}

function getChunkOwnerAt(owners: ChunkOwners, x: number, y: number) {
  return owners[getChunkKeyFromTile(x, y)];
}

function createOwnersForGrid(grid: number[][], ownerId: string): ChunkOwners {
  const owners: ChunkOwners = {};
  if (grid.length === 0 || grid[0].length === 0) return owners;

  const cols = Math.ceil(grid[0].length / CHUNK_SIZE);
  const rows = Math.ceil(grid.length / CHUNK_SIZE);

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      owners[makeChunkKey(cx, cy)] = ownerId;
    }
  }

  return owners;
}

function createDefaultGrid() {
  return Array(CHUNK_SIZE)
    .fill(0)
    .map(() => Array(CHUNK_SIZE).fill(DEFAULT_FLOOR));
}

function getTileStyle(tileId: number) {
  const def = getTileDef(tileId);
  if (!def) {
    return { background: VOID_TILE_COLOR };
  }
  return {
    backgroundImage: `url(${def.image})`,
    backgroundColor: VOID_TILE_COLOR,
  };
}

function buildChunkTiles(grid: number[][], cx: number, cy: number) {
  const tiles: number[] = [];
  const startX = cx * CHUNK_SIZE;
  const startY = cy * CHUNK_SIZE;

  for (let y = 0; y < CHUNK_SIZE; y++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const value = grid[startY + y]?.[startX + x];
      tiles.push(typeof value === "number" ? value : 0);
    }
  }

  return tiles;
}

function parseCoord(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function clampU8(value: number, max: number) {
  const clamped = Math.max(0, Math.min(max, value));
  return Number.isFinite(clamped) ? clamped : 0;
}

function extractObjectId(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  const record = value as Record<string, unknown>;
  if (typeof record.id === "string") return record.id;
  if (record.id && typeof record.id === "object") {
    const nested = record.id as Record<string, unknown>;
    if (typeof nested.id === "string") return nested.id;
  }
  if (record.fields && typeof record.fields === "object") {
    const fields = record.fields as Record<string, unknown>;
    if (typeof fields.id === "string") return fields.id;
    if (fields.id && typeof fields.id === "object") {
      const nested = fields.id as Record<string, unknown>;
      if (typeof nested.id === "string") return nested.id;
    }
  }

  return "";
}

function shortAddress(value?: string) {
  if (!value) return "";
  if (value.length <= 12) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function normalizeMoveFields(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  if (record.fields && typeof record.fields === "object") {
    return record.fields as Record<string, unknown>;
  }
  return record;
}

function normalizeMoveVector(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const fields = normalizeMoveFields(value);
  if (Array.isArray(fields.vec)) return fields.vec;
  return [];
}

function parseU32Value(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return null;
}

function extractChunkCoords(value: unknown): { cx: number; cy: number } | null {
  const fields = normalizeMoveFields(value);
  const cx = parseU32Value(fields.cx);
  const cy = parseU32Value(fields.cy);
  if (cx === null || cy === null) return null;
  return { cx, cy };
}

function extractOwnerAddress(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  if (typeof record.AddressOwner === "string") return record.AddressOwner;
  if (typeof record.ObjectOwner === "string") return record.ObjectOwner;
  if (
    record.ConsensusAddressOwner &&
    typeof record.ConsensusAddressOwner === "object"
  ) {
    const inner = record.ConsensusAddressOwner as Record<string, unknown>;
    if (typeof inner.owner === "string") return inner.owner;
  }
  return "";
}

async function fetchAllDynamicFields(parentId: string) {
  const all: Array<{ name: { type?: string; value?: unknown } }> = [];
  let cursor: string | null | undefined = null;
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

async function resolveChunkEntries(
  worldId: string,
  fields: Array<{ name: { type?: string; value?: unknown } }>
) {
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
    .filter(
      (
        result
      ): result is PromiseFulfilledResult<{
        cx: number;
        cy: number;
        chunkId: string;
      }> => result.status === "fulfilled"
    )
    .map((result) => result.value)
    .filter((entry): entry is { cx: number; cy: number; chunkId: string } =>
      Boolean(entry)
    );
}

/* ================= TILE BUTTON ================= */

function TileButton({
  label,
  image,
  kind,
  active,
  onClick,
}: {
  label: string;
  image: string;
  kind: "ground" | "abyssWall";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`tile-button ${active ? "tile-button--active" : ""} ${
        kind === "abyssWall" ? "tile-button--abyss" : ""
      }`}
      style={{ backgroundImage: `url(${image})` }}
      title={`${label} (${kind === "abyssWall" ? "abyss wall" : "ground"})`}
    >
      {label}
    </button>
  );
}
