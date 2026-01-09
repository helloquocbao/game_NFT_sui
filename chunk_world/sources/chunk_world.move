module chunk_world::world {

    use std::hash;
    use std::string::{Self, String};

    use sui::dynamic_field as df;
    use sui::event;
    use sui::coin::{Self, Coin};
    use sui::random;

    use chunk_world::reward_coin;
    use chunk_world::reward_coin::RewardVault;

    // NFT Display
    use sui::package;
    use sui::display;

    /* ================= CONFIG ================= */

    const CHUNK_SIZE: u64 = 8;
    const TILES_LEN: u64 = 64; // 8*8
    const MAX_URL_BYTES: u64 = 2048;

    const U32_MAX: u32 = 4294967295;
    const PLAY_FEE: u64 = 5;
    const MIN_REWARD: u64 = 2;
    const MAX_REWARD: u64 = 15;

    /* ================= ERRORS ================= */

    const E_WORLD_ALREADY_CREATED: u64 = 0;
    const E_INVALID_TILES_LEN: u64 = 1;
    const E_INVALID_TILE_CODE: u64 = 2;
    const E_OUT_OF_BOUNDS: u64 = 3;
    const E_URL_TOO_LONG: u64 = 4;
    const E_CHUNK_ALREADY_EXISTS: u64 = 5;
    const E_FIRST_CHUNK_MUST_BE_ORIGIN: u64 = 6;
    const E_NO_ADJACENT_CHUNK: u64 = 7;
    const E_INVALID_FEE: u64 = 8;
    const E_INVALID_REWARD_RANGE: u64 = 9;
    const E_PLAY_NOT_FOUND: u64 = 10;
    const E_INVALID_SEAL: u64 = 11;

    /* ================= ADMIN / REGISTRY ================= */

    /// Admin giữ cap này. Ai không có cap thì không tạo được world.
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Registry shared để enforce: chỉ có 1 world trong package này.
    public struct WorldRegistry has key, store {
        id: UID,
        world_id: Option<ID>,
    }

    /* ================= WORLD (SHARED) ================= */

    /// Key cho dynamic field: (cx, cy) -> chunk_id
    public struct ChunkKey has copy, drop, store {
        cx: u32,
        cy: u32,
    }

    /// Key cho dynamic field: play_id -> PlayTicket
    public struct PlayKey has copy, drop, store {
        id: u64,
    }

    public struct PlayTicket has store {
        seal: vector<u8>,
        min_reward: u64,
        max_reward: u64,
    }

    public struct WorldMap has key, store {
        id: UID,
        chunk_count: u64,
        next_play_id: u64,
        admin: address,
        chunks: vector<ChunkKey>,
    }

    /* ================= CHUNK NFT (OWNED) ================= */

    /// Mỗi chunk = 1 NFT owned. Owner mới edit được.
    public struct ChunkNFT has key, store {
        id: UID,
        world_id: ID,
        cx: u32,
        cy: u32,
        image_url: String,
        tiles: vector<u8>, // length=64, idx = y*8 + x
    }

    /* ================= EVENTS ================= */

    public struct RegistryCreatedEvent has copy, drop {
        registry_id: ID,
        admin: address,
        admin_cap_id: ID,
    }

    public struct WorldCreatedEvent has copy, drop {
        world_id: ID,
        admin: address,
    }

    public struct ChunkClaimedEvent has copy, drop {
        world_id: ID,
        chunk_id: ID,
        cx: u32,
        cy: u32,
        owner: address,
    }

    public struct ChunkTileUpdatedEvent has copy, drop {
        chunk_id: ID,
        x: u8,
        y: u8,
        tile: u8,
    }

    public struct ChunkImageUpdatedEvent has copy, drop {
        chunk_id: ID,
    }

    public struct PlayCreatedEvent has copy, drop {
        world_id: ID,
        play_id: u64,
        min_reward: u64,
        max_reward: u64,
        creator: address,
    }

    public struct RewardClaimedEvent has copy, drop {
        world_id: ID,
        play_id: u64,
        reward: u64,
        recipient: address,
    }

    /* ================= DISPLAY INIT (làm đẹp NFT) ================= */

    /// One-Time Witness cho init()
    public struct WORLD has drop {}

    /// init chạy khi publish package:
    /// - set Display cho ChunkNFT
    /// - tạo WorldRegistry (shared)
    /// - tạo AdminCap cho deployer
    fun init(otw: WORLD, ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);

        // 1) Display template cho ChunkNFT (wallet/explorer sẽ đọc các field này)
        let publisher = package::claim(otw, ctx);

        let keys = vector[
            string::utf8(b"name"),
            string::utf8(b"description"),
            string::utf8(b"image_url"),
            string::utf8(b"thumbnail_url"),
            string::utf8(b"link"),
            string::utf8(b"project_url"),
            string::utf8(b"creator"),
        ];

        // Bạn đổi domain theo project của bạn
        let values = vector[
            string::utf8(b"Chunk ({cx},{cy})"),
            string::utf8(b"Chunk in World {world_id}"),
            string::utf8(b"{image_url}"),
            string::utf8(b"{image_url}"),
            string::utf8(b"https://your-game.com/chunk/{id}"),
            string::utf8(b"https://your-game.com"),
            string::utf8(b"Chunk World"),
        ];

        let mut disp = display::new_with_fields<ChunkNFT>(&publisher, keys, values, ctx);
        display::update_version(&mut disp);

        transfer::public_transfer(publisher, admin);
        transfer::public_transfer(disp, admin);

        // 2) Registry shared (enforce chỉ tạo 1 world)
        let registry = WorldRegistry {
            id: object::new(ctx),
            world_id: option::none<ID>(),
        };
        let registry_id = object::uid_to_inner(&registry.id);
        transfer::share_object(registry);

        // 3) AdminCap cho deployer
        let cap = AdminCap { id: object::new(ctx) };
        let cap_id = object::uid_to_inner(&cap.id);
        transfer::public_transfer(cap, admin);

        event::emit(RegistryCreatedEvent { registry_id, admin, admin_cap_id: cap_id });
    }

    /* ================= ADMIN: CREATE WORLD ================= */

    /// Admin tạo world (shared). Chỉ tạo 1 lần.
     entry fun create_world(
        registry: &mut WorldRegistry,
        _cap: &AdminCap,
        ctx: &mut TxContext
    ) {
        assert!(!option::is_some(&registry.world_id), E_WORLD_ALREADY_CREATED);

        let admin = tx_context::sender(ctx);
        let world = WorldMap {
            id: object::new(ctx),
            chunk_count: 0,
            next_play_id: 0,
            admin,
            chunks: vector[],
        };

        let world_id = object::uid_to_inner(&world.id);
        registry.world_id = option::some<ID>(world_id);

        transfer::share_object(world);

        event::emit(WorldCreatedEvent { world_id, admin });
    }

    /* ================= USER: CLAIM / MINT CHUNK NFT ================= */

    /// User claim chunk NFT. Coordinates are chosen randomly among adjacent slots.
    /// Rule:
    /// - Chunk đầu tiên của world bắt buộc (0,0)
    /// - Chunk sau phải kề 1 chunk đã tồn tại (4 hướng)
     entry fun claim_chunk(
        world: &mut WorldMap,
        randomness: &random::Random,
        image_url: String,
        tiles: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(string::length(&image_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);

        let (cx, cy) = if (world.chunk_count == 0) {
            (0, 0)
        } else {
            let mut generator = random::new_generator(randomness, ctx);
            pick_random_adjacent(world, &mut generator)
        };
        assert!(
            !df::exists_(&world.id, ChunkKey { cx, cy }),
            E_CHUNK_ALREADY_EXISTS
        );

        if (world.chunk_count == 0) {
            assert!(cx == 0 && cy == 0, E_FIRST_CHUNK_MUST_BE_ORIGIN);
        } else {
            assert!(has_adjacent(world, cx, cy), E_NO_ADJACENT_CHUNK);
        };

        let sender = tx_context::sender(ctx);
        let world_id = object::uid_to_inner(&world.id);

        let chunk = ChunkNFT {
            id: object::new(ctx),
            world_id,
            cx,
            cy,
            image_url,
            tiles,
        };

        let chunk_id = object::uid_to_inner(&chunk.id);

        // index (cx,cy) -> chunk_id
        df::add(&mut world.id, ChunkKey { cx, cy }, chunk_id);
        world.chunk_count = world.chunk_count + 1;
        vector::push_back(&mut world.chunks, ChunkKey { cx, cy });

        event::emit(ChunkClaimedEvent { world_id, chunk_id, cx, cy, owner: sender });

        transfer::public_transfer(chunk, sender);
    }

    /* ================= GAME: PLAY / REWARD ================= */

    /// seal = hash::sha3_256(key_bytes) (compute off-chain)
     entry fun play(
        world: &mut WorldMap,
        vault: &mut RewardVault,
        mut fee_coin: Coin<reward_coin::REWARD_COIN>,
        seal: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(vector::length(&seal) > 0, E_INVALID_SEAL);
        assert!(MAX_REWARD >= MIN_REWARD && MIN_REWARD > 0, E_INVALID_REWARD_RANGE);

        let fee_value = coin::value(&fee_coin);
        assert!(fee_value >= PLAY_FEE, E_INVALID_FEE);

        let sender = tx_context::sender(ctx);
        if (fee_value > PLAY_FEE) {
            let pay_coin = coin::split(&mut fee_coin, PLAY_FEE, ctx);
            reward_coin::deposit(vault, pay_coin);
            transfer::public_transfer(fee_coin, sender);
        } else {
            reward_coin::deposit(vault, fee_coin);
        };

        reward_coin::reserve(vault, MAX_REWARD);

        let play_id = world.next_play_id;
        world.next_play_id = play_id + 1;
        df::add(
            &mut world.id,
            PlayKey { id: play_id },
            PlayTicket { seal, min_reward: MIN_REWARD, max_reward: MAX_REWARD }
        );

        let world_id = object::uid_to_inner(&world.id);
        event::emit(PlayCreatedEvent { world_id, play_id, min_reward: MIN_REWARD, max_reward: MAX_REWARD, creator: sender });
    }

     entry fun claim_reward(
        world: &mut WorldMap,
        vault: &mut RewardVault,
        randomness: &random::Random,
        play_id: u64,
        key: vector<u8>,
        ctx: &mut TxContext
    ) {
        assert!(df::exists_(&world.id, PlayKey { id: play_id }), E_PLAY_NOT_FOUND);
        assert!(vector::length(&key) > 0, E_INVALID_SEAL);

        let PlayTicket { seal, min_reward, max_reward } =
            df::remove(&mut world.id, PlayKey { id: play_id });
        let digest = hash::sha3_256(key);
        assert!(seal == digest, E_INVALID_SEAL);
        assert!(max_reward >= min_reward && min_reward > 0, E_INVALID_REWARD_RANGE);

        let mut rng = random::new_generator(randomness, ctx);
        let reward = random::generate_u64_in_range(&mut rng, min_reward, max_reward);

        reward_coin::unreserve(vault, max_reward);
        let coin = reward_coin::withdraw(vault, reward, ctx);

        let recipient = tx_context::sender(ctx);
        transfer::public_transfer(coin, recipient);

        let world_id = object::uid_to_inner(&world.id);
        event::emit(RewardClaimedEvent { world_id, play_id, reward, recipient });
    }

    /* ================= OWNER: EDIT CHUNK ================= */

     entry fun set_tile(chunk: &mut ChunkNFT, x: u8, y: u8, tile: u8) {
        assert!(x < 8u8 && y < 8u8, E_OUT_OF_BOUNDS);
        assert!(is_valid_tile(tile), E_INVALID_TILE_CODE);

        let idx = (y as u64) * CHUNK_SIZE + (x as u64);
        *vector::borrow_mut(&mut chunk.tiles, idx) = tile;

        event::emit(ChunkTileUpdatedEvent {
            chunk_id: object::uid_to_inner(&chunk.id),
            x, y, tile
        });
    }

    /// Batch save 64 tiles (khuyên dùng để giảm tx)
     entry fun set_tiles(chunk: &mut ChunkNFT, tiles: vector<u8>) {
        assert!(vector::length(&tiles) == TILES_LEN, E_INVALID_TILES_LEN);
        assert_tiles_valid(&tiles);
        chunk.tiles = tiles;
    }

     entry fun set_image_url(chunk: &mut ChunkNFT, new_url: String) {
        assert!(string::length(&new_url) <= MAX_URL_BYTES, E_URL_TOO_LONG);
        chunk.image_url = new_url;

        event::emit(ChunkImageUpdatedEvent { chunk_id: object::uid_to_inner(&chunk.id) });
    }

    /* ================= READ HELPERS (optional) ================= */

    public fun get_chunk_id(world: &WorldMap, cx: u32, cy: u32): Option<ID> {
        let key = ChunkKey { cx, cy };
        if (!df::exists_(&world.id, key)) {
            option::none<ID>()
        } else {
            option::some<ID>(*df::borrow(&world.id, key))
        }
    }

    /* ================= INTERNAL HELPERS ================= */

    fun pick_random_adjacent(
        world: &WorldMap,
        rng: &mut random::RandomGenerator
    ): (u32, u32) {
        let mut candidates = vector[];
        let total = vector::length(&world.chunks);
        let mut i = 0;
        while (i < total) {
            let chunk = *vector::borrow(&world.chunks, i);
            let cx = chunk.cx;
            let cy = chunk.cy;

            // left
            if (cx > 0) {
                let nx = cx - 1;
                if (!df::exists_(&world.id, ChunkKey { cx: nx, cy })) {
                    vector::push_back(&mut candidates, ChunkKey { cx: nx, cy });
                };
            };
            // right (avoid overflow)
            if (cx < U32_MAX) {
                let nx = cx + 1;
                if (!df::exists_(&world.id, ChunkKey { cx: nx, cy })) {
                    vector::push_back(&mut candidates, ChunkKey { cx: nx, cy });
                };
            };

            // top
            if (cy > 0) {
                let ny = cy - 1;
                if (!df::exists_(&world.id, ChunkKey { cx, cy: ny })) {
                    vector::push_back(&mut candidates, ChunkKey { cx, cy: ny });
                };
            };
            // bottom (avoid overflow)
            if (cy < U32_MAX) {
                let ny = cy + 1;
                if (!df::exists_(&world.id, ChunkKey { cx, cy: ny })) {
                    vector::push_back(&mut candidates, ChunkKey { cx, cy: ny });
                };
            };

            i = i + 1;
        };

        let count = vector::length(&candidates);
        assert!(count > 0, E_NO_ADJACENT_CHUNK);
        let index = random::generate_u64_in_range(rng, 0, count - 1);
        let chosen = *vector::borrow(&candidates, index);
        (chosen.cx, chosen.cy)
    }

    fun has_adjacent(world: &WorldMap, cx: u32, cy: u32): bool {
        let mut ok = false;

        // left
        if (cx > 0) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx: cx - 1, cy });
        };
        // right (avoid overflow)
        if (cx < U32_MAX) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx: cx + 1, cy });
        };

        // top
        if (cy > 0) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx, cy: cy - 1 });
        };
        // bottom (avoid overflow)
        if (cy < U32_MAX) {
            ok = ok || df::exists_(&world.id, ChunkKey { cx, cy: cy + 1 });
        };

        ok
    }

    /// Allowed codes: 0,1,2,4,5,6,7,8
    fun is_valid_tile(t: u8): bool {
        (t == 0) || (t == 1) || (t == 2) || (t == 4) ||
        (t == 5) || (t == 6) || (t == 7) || (t == 8)
    }

    fun assert_tiles_valid(tiles: &vector<u8>) {
        let mut i = 0;
        let n = vector::length(tiles);
        while (i < n) {
            let t = *vector::borrow(tiles, i);
            assert!(is_valid_tile(t), E_INVALID_TILE_CODE);
            i = i + 1;
        }
    }
}
