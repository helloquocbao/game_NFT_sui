// Local storage based dungeon service (no blockchain)

const STORAGE_KEY = "walrus_dungeons";

// Mock games for demo
const MOCK_GAMES = [
  {
    id: "demo-1",
    name: "Basic Dungeon",
    creator: "demo-creator",
    likes: 5,
    imageUrl: null,
    blobId: null,
    patchMapId: "demo-1-map",
    settings: {
      config: {
        width: 20,
        height: 12,
        tileSize: 32,
      },
      layout: [
        "###################",
        "#.................#",
        "#.................#",
        "#.....P....K.....#",
        "#.................#",
        "#.................#",
        "#.................#",
        "#.................#",
        "#.................#",
        "#..G..G..G..G...G#",
        "#.................#",
        "###################",
      ],
    },
  },
];

const validateMapJson = (map) => {
  if (!map || typeof map !== "object") return false;
  if (!map.layout || !Array.isArray(map.layout) || map.layout.length === 0)
    return false;
  const { config } = map;
  if (
    !config ||
    typeof config.width !== "number" ||
    typeof config.height !== "number" ||
    config.width <= 0 ||
    config.height <= 0
  )
    return false;
  const widthOk = map.layout.every(
    (row) => typeof row === "string" && row.length === config.width
  );
  return widthOk;
};

export const loadDungeonsFromLocal = async () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    // Return mock games as default
    return MOCK_GAMES;
  } catch (err) {
    console.error("Error loading games:", err);
    return MOCK_GAMES;
  }
};

export const fetchDungeonById = async (objectId) => {
  try {
    const dungeons = await loadDungeonsFromLocal();
    return dungeons.find((d) => d.id === objectId) || null;
  } catch (err) {
    console.error("Error fetching dungeon:", err);
    return null;
  }
};

export const readDungeonMap = async (mapId) => {
  try {
    const dungeons = await loadDungeonsFromLocal();
    const dungeon = dungeons.find((d) => d.patchMapId === mapId);
    if (dungeon && dungeon.settings) {
      return dungeon.settings;
    }
    throw new Error("Map not found");
  } catch (err) {
    console.error("Error reading map:", err);
    throw err;
  }
};

export const validateMapJsonSchema = validateMapJson;

export const saveDungeonLocally = async (dungeon) => {
  try {
    const dungeons = await loadDungeonsFromLocal();
    const index = dungeons.findIndex((d) => d.id === dungeon.id);
    if (index >= 0) {
      dungeons[index] = { ...dungeons[index], ...dungeon };
    } else {
      dungeons.push(dungeon);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dungeons));
    return dungeon;
  } catch (err) {
    console.error("Error saving dungeon:", err);
    throw err;
  }
};

export const deleteDungeonLocally = async (dungeonId) => {
  try {
    const dungeons = await loadDungeonsFromLocal();
    const filtered = dungeons.filter((d) => d.id !== dungeonId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error("Error deleting dungeon:", err);
    throw err;
  }
};

// Legacy function names for compatibility
export const loadDungeonsFromWallet = loadDungeonsFromLocal;
export const fetchDungeonsByOwner = loadDungeonsFromLocal;
export const getWalrusImageUrl = (blobId) => blobId || null;
