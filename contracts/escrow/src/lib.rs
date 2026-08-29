//! Escrow contract for the Pi services marketplace hire flow.
//!
//! Lifecycle (mirrors the `request_status` enum in supabase/schema.sql and
//! the hire_requests table's status column):
//!
//!   Locked --release()--> Released
//!   Locked --refund()---> Refunded
//!   Locked --dispute()--> Disputed --resolve()--> Released | Refunded
//!
//! This is written against soroban-sdk (the framework Pi's contract runtime
//! is modeled on, per Pi's Rust SDK announcement being "modeled after the
//! Stellar Soroban Rust SDK"). Swap the token client for Pi's native token
//! contract address once that's published; the escrow logic itself is
//! chain-agnostic Soroban and should port with minimal changes.
#![no_std]

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, token, Address, Env,
    String as SorobanString,
};

#[contracttype]
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum EscrowStatus {
    Locked = 0,
    Released = 1,
    Refunded = 2,
    Disputed = 3,
}

#[contracttype]
#[derive(Clone)]
pub struct Escrow {
    pub buyer: Address,
    pub provider: Address,
    pub token: Address,
    pub amount: i128,
    pub platform_fee_bps: u32, // basis points, e.g. 1000 = 10%
    pub platform: Address,
    pub status: EscrowStatus,
}

#[contracttype]
pub enum DataKey {
    Escrow(SorobanString), // request_id -> Escrow
    Admin,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
pub enum EscrowError {
    AlreadyExists = 1,
    NotFound = 2,
    WrongStatus = 3,
    Unauthorized = 4,
    InvalidAmount = 5,
    InvalidFee = 6,
}

#[contractevent]
pub struct EscrowLocked {
    pub request_id: SorobanString,
    pub buyer: Address,
    pub provider: Address,
    pub amount: i128,
}

#[contractevent]
pub struct EscrowReleased {
    pub request_id: SorobanString,
    pub to_provider: i128,
    pub to_platform: i128,
}

#[contractevent]
pub struct EscrowRefunded {
    pub request_id: SorobanString,
    pub amount: i128,
}

#[contractevent]
pub struct EscrowDisputed {
    pub request_id: SorobanString,
}

const MAX_FEE_BPS: u32 = 2000; // 20% hard ceiling, sanity guard against misconfiguration

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// One-time setup: records the admin address allowed to resolve disputes.
    pub fn init(env: Env, admin: Address) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Buyer locks `amount` of `token` into escrow for `request_id`, matching
    /// a hire_requests row moving from 'accepted' to 'locked'. Requires the
    /// buyer's signature (require_auth), then pulls the tokens from the
    /// buyer's wallet into the contract via a standard token transfer.
    pub fn lock(
        env: Env,
        request_id: SorobanString,
        buyer: Address,
        provider: Address,
        token: Address,
        amount: i128,
        platform: Address,
        platform_fee_bps: u32,
    ) -> Result<(), EscrowError> {
        buyer.require_auth();

        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }
        if platform_fee_bps > MAX_FEE_BPS {
            return Err(EscrowError::InvalidFee);
        }

        let key = DataKey::Escrow(request_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(EscrowError::AlreadyExists);
        }

        // Pull funds from buyer into this contract's own balance.
        let token_client = token::Client::new(&env, &token);
        token_client.transfer(&buyer, &env.current_contract_address(), &amount);

        let escrow = Escrow {
            buyer: buyer.clone(),
            provider: provider.clone(),
            token,
            amount,
            platform_fee_bps,
            platform,
            status: EscrowStatus::Locked,
        };
        env.storage().persistent().set(&key, &escrow);

        env.events().publish(
            (),
            EscrowLocked { request_id, buyer, provider, amount },
        );
        Ok(())
    }

    /// Buyer confirms delivery -> pays the provider (minus platform fee).
    /// Matches hire_requests moving 'delivered' -> 'released'.
    pub fn release(env: Env, request_id: SorobanString) -> Result<(), EscrowError> {
        let key = DataKey::Escrow(request_id.clone());
        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        // Either the buyer confirms, or (future) an auto-release condition
        // signed by an oracle/admin could call this — for v1, buyer only.
        escrow.buyer.require_auth();

        if escrow.status != EscrowStatus::Locked {
            return Err(EscrowError::WrongStatus);
        }

        let fee = (escrow.amount * escrow.platform_fee_bps as i128) / 10_000;
        let to_provider = escrow.amount - fee;

        let token_client = token::Client::new(&env, &escrow.token);
        let this = env.current_contract_address();
        token_client.transfer(&this, &escrow.provider, &to_provider);
        if fee > 0 {
            token_client.transfer(&this, &escrow.platform, &fee);
        }

        escrow.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &escrow);

        env.events().publish(
            (),
            EscrowReleased { request_id, to_provider, to_platform: fee },
        );
        Ok(())
    }

    /// Refunds the buyer in full. Callable by the provider (voluntary
    /// cancellation) or the admin (dispute resolution in buyer's favor).
    pub fn refund(env: Env, request_id: SorobanString, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(request_id.clone());
        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        let admin: Option<Address> = env.storage().instance().get(&DataKey::Admin);
        let is_provider = caller == escrow.provider;
        let is_admin = admin.as_ref() == Some(&caller);
        if !is_provider && !is_admin {
            return Err(EscrowError::Unauthorized);
        }

        if escrow.status != EscrowStatus::Locked && escrow.status != EscrowStatus::Disputed {
            return Err(EscrowError::WrongStatus);
        }

        let token_client = token::Client::new(&env, &escrow.token);
        token_client.transfer(&env.current_contract_address(), &escrow.buyer, &escrow.amount);

        escrow.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &escrow);

        env.events()
            .publish((), EscrowRefunded { request_id, amount: escrow.amount });
        Ok(())
    }

    /// Either party flags a dispute, freezing release/refund until the
    /// admin calls resolve_dispute. Matches hire_requests 'disputed'.
    pub fn dispute(env: Env, request_id: SorobanString, caller: Address) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(request_id.clone());
        let mut escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        if caller != escrow.buyer && caller != escrow.provider {
            return Err(EscrowError::Unauthorized);
        }
        if escrow.status != EscrowStatus::Locked {
            return Err(EscrowError::WrongStatus);
        }

        escrow.status = EscrowStatus::Disputed;
        env.storage().persistent().set(&key, &escrow);

        env.events().publish((), EscrowDisputed { request_id });
        Ok(())
    }

    /// Admin resolves a dispute by directing funds to either party.
    pub fn resolve_dispute(
        env: Env,
        request_id: SorobanString,
        favor_provider: bool,
    ) -> Result<(), EscrowError> {
        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(EscrowError::Unauthorized)?;
        admin.require_auth();

        let key = DataKey::Escrow(request_id.clone());
        let escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        if escrow.status != EscrowStatus::Disputed {
            return Err(EscrowError::WrongStatus);
        }

        if favor_provider {
            Self::release(env, request_id)
        } else {
            Self::refund(env, request_id, admin)
        }
    }

    pub fn get_status(env: Env, request_id: SorobanString) -> Result<EscrowStatus, EscrowError> {
        let key = DataKey::Escrow(request_id);
        let escrow: Escrow = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;
        Ok(escrow.status)
    }
}

mod test;
