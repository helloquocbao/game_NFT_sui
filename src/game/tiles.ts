export type TileKind = "ground" | "abyssWall";

export type TileDef = {
  id: number;
  name: string;
  image: string;
  kind: TileKind;
};

export const TILE_SPRITE_SIZE = 64;

const TILE_BASE_PATH = "/sprites/Tiles/tilemap-slices";

const TILE_NAMES = [
  "tile_r00_c00",
  "tile_r00_c01",
  "tile_r00_c02",
  "tile_r00_c03",
  "tile_r00_c05",
  "tile_r00_c06",
  "tile_r00_c07",
  "tile_r00_c08",
  "tile_r01_c00",
  "tile_r01_c01",
  "tile_r01_c02",
  "tile_r01_c03",
  "tile_r01_c05",
  "tile_r01_c06",
  "tile_r01_c07",
  "tile_r01_c08",
  "tile_r02_c00",
  "tile_r02_c01",
  "tile_r02_c02",
  "tile_r02_c03",
  "tile_r02_c05",
  "tile_r02_c06",
  "tile_r02_c07",
  "tile_r02_c08",
  "tile_r03_c00",
  "tile_r03_c01",
  "tile_r03_c02",
  "tile_r03_c03",
  "tile_r03_c05",
  "tile_r03_c06",
  "tile_r03_c07",
  "tile_r03_c08",
  "tile_r04_c00",
  "tile_r04_c03",
  "tile_r04_c05",
  "tile_r04_c06",
  "tile_r04_c07",
  "tile_r04_c08",
  "tile_r05_c00",
  "tile_r05_c03",
  "tile_r05_c05",
  "tile_r05_c06",
  "tile_r05_c07",
  "tile_r05_c08",
];

const ABYSS_WALL_NAMES = new Set([
  "tile_r04_c05",
  "tile_r04_c06",
  "tile_r04_c07",
  "tile_r04_c08",
  "tile_r05_c05",
  "tile_r05_c06",
  "tile_r05_c07",
  "tile_r05_c08",
]);

export const TILE_DEFS: TileDef[] = TILE_NAMES.map((name, index) => ({
  id: index + 1,
  name,
  image: `${TILE_BASE_PATH}/${name}.png`,
  kind: ABYSS_WALL_NAMES.has(name) ? "abyssWall" : "ground",
}));

const TILE_BY_ID = new Map(TILE_DEFS.map((def) => [def.id, def]));

export const MAX_TILE_ID = TILE_DEFS.length;
export const DEFAULT_GROUND_TILE_ID =
  TILE_DEFS.find((def) => def.kind === "ground")?.id ?? 1;
export const VOID_TILE_ID = 0;

export function getTileDef(id: number) {
  return TILE_BY_ID.get(id);
}

export function isTileDefined(id: number) {
  return TILE_BY_ID.has(id);
}

export function isWalkableTile(id: number) {
  const def = TILE_BY_ID.get(id);
  return def?.kind === "ground";
}

export function isAbyssWallTile(id: number) {
  const def = TILE_BY_ID.get(id);
  return def?.kind === "abyssWall";
}

export function normalizeTileId(id: number) {
  return isTileDefined(id) ? id : VOID_TILE_ID;
}
