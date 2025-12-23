module sui_dungeon::sui_dungeon;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::event;
use sui::object::{Self, UID};
use sui::sui::SUI;
use sui::table::{Self, Table};
use sui::transfer;
use sui::tx_context::{Self, TxContext};

// Fixed fee per new chunk (1.3 SUI in mist).
const EXPAND_FEE_MIST: u64 = 1_300_000_000;
// Default map metadata shared by all clients.
const DEFAULT_CHUNK_SIZE: u64 = 16;
const DEFAULT_TILE_SIZE: u64 = 32;

// Abort codes.
const E_CHUNK_EXISTS: u64 = 0;
const E_INCORRECT_PAYMENT: u64 = 1;
const E_INSUFFICIENT_TREASURY: u64 = 2;

// Global shared object storing map metadata and chunk registry.
public struct MapRegistry has key {
    id: UID,
    chunk_size: u64,
    tile_size: u64,
    expand_fee: u64,
    treasury: Balance<SUI>,
    chunks: Table<ChunkCoord, ChunkMeta>,
}

// Admin capability minted at publish time.
public struct AdminCap has key {
    id: UID,
}

// Chunk coordinate (chunk space, not tile space).
public struct ChunkCoord has copy, drop, store {
    x: u64,
    y: u64,
}

// Metadata for a single chunk stored off-chain (Walrus).
public struct ChunkMeta has store {
    owner: address,
    walrus_uri: vector<u8>,
    content_hash: vector<u8>,
}

// Event emitted whenever a new chunk is added.
public struct ChunkExpandedEvent has copy, drop {
    x: u64,
    y: u64,
    owner: address,
}

// Initialize the package by minting the admin capability to the publisher.
fun init(ctx: &mut TxContext) {
    let cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(cap, tx_context::sender(ctx));
}

// Create and share the single MapRegistry object.
 entry fun create_registry(_admin: &AdminCap, ctx: &mut TxContext) {
    let registry = MapRegistry {
        id: object::new(ctx),
        chunk_size: DEFAULT_CHUNK_SIZE,
        tile_size: DEFAULT_TILE_SIZE,
        expand_fee: EXPAND_FEE_MIST,
        treasury: balance::zero<SUI>(),
        chunks: table::new(ctx),
    };
    transfer::share_object(registry);
}

// Add a brand-new chunk. Existing chunks cannot be overwritten or deleted.
 entry fun expand_chunk(
    registry: &mut MapRegistry,
    x: u64,
    y: u64,
    walrus_uri: vector<u8>,
    content_hash: vector<u8>,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
) {
    let coord = ChunkCoord { x, y };
    if (table::contains(&registry.chunks, copy coord)) {
        abort E_CHUNK_EXISTS
    };

    let paid = coin::value(&payment);
    if (paid != registry.expand_fee) {
        abort E_INCORRECT_PAYMENT
    };

    // Collect fee into treasury.
    balance::join(&mut registry.treasury, coin::into_balance(payment));

    let meta = ChunkMeta {
        owner: tx_context::sender(ctx),
        walrus_uri,
        content_hash,
    };
    table::add(&mut registry.chunks, coord, meta);

    // Notify off-chain indexers / clients.
    event::emit(ChunkExpandedEvent {
        x,
        y,
        owner: tx_context::sender(ctx),
    });
}

/// Admin rút tiền từ treasury.
/// - Chỉ ai có `AdminCap` mới gọi được.
/// - `amount` tính theo mist.
/// - `recipient` là địa chỉ nhận tiền.
 entry fun withdraw_treasury(
    _admin: &AdminCap,
    registry: &mut MapRegistry,
    amount: u64,
    recipient: address,
    ctx: &mut TxContext,
) {
    // Kiểm tra đủ tiền trong treasury
    let available = balance::value(&registry.treasury);
    if (available < amount) {
        abort E_INSUFFICIENT_TREASURY
    };

    // Tách amount ra khỏi Balance<SUI>
    let withdrawn_balance = balance::split(&mut registry.treasury, amount);

    // Đổi Balance<SUI> -> Coin<SUI> để chuyển ra ngoài
    let withdrawn_coin = coin::from_balance<SUI>(withdrawn_balance, ctx);

    // Chuyển coin cho người nhận
    transfer::public_transfer(withdrawn_coin, recipient);
}