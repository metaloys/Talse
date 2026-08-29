#![cfg(test)]

use super::*;
use soroban_sdk::testutils::Address as _;
use soroban_sdk::{token, Env, String as SorobanString};

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (token::Client<'a>, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    (
        token::Client::new(env, &sac.address()),
        token::StellarAssetClient::new(env, &sac.address()),
    )
}

fn setup<'a>() -> (
    Env,
    EscrowContractClient<'a>,
    Address, // buyer
    Address, // provider
    Address, // platform
    Address, // admin
    token::Client<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();

    let token_admin = Address::generate(&env);
    let (token_client, token_sac) = create_token_contract(&env, &token_admin);

    let buyer = Address::generate(&env);
    let provider = Address::generate(&env);
    let platform = Address::generate(&env);
    let admin = Address::generate(&env);

    token_sac.mint(&buyer, &100_000);

    let contract_id = env.register(EscrowContract, ());
    let client = EscrowContractClient::new(&env, &contract_id);
    client.init(&admin);

    (env, client, buyer, provider, platform, admin, token_client)
}

#[test]
fn lock_then_release_pays_provider_minus_fee() {
    let (env, client, buyer, provider, platform, _admin, token) = setup();
    let request_id = SorobanString::from_str(&env, "hire-1");

    client.lock(&request_id, &buyer, &provider, &token.address, &10_000, &platform, &1000); // 10% fee

    assert_eq!(token.balance(&buyer), 90_000);
    assert_eq!(token.balance(&provider), 0);
    assert_eq!(client.get_status(&request_id), EscrowStatus::Locked);

    client.release(&request_id);

    assert_eq!(token.balance(&provider), 9_000);
    assert_eq!(token.balance(&platform), 1_000);
    assert_eq!(client.get_status(&request_id), EscrowStatus::Released);
}

#[test]
fn lock_then_refund_returns_full_amount_to_buyer() {
    let (env, client, buyer, provider, platform, _admin, token) = setup();
    let request_id = SorobanString::from_str(&env, "hire-2");

    client.lock(&request_id, &buyer, &provider, &token.address, &5_000, &platform, &500);
    assert_eq!(token.balance(&buyer), 95_000);

    // provider voluntarily refunds (e.g. can't fulfill)
    client.refund(&request_id, &provider);

    assert_eq!(token.balance(&buyer), 100_000);
    assert_eq!(client.get_status(&request_id), EscrowStatus::Refunded);
}

#[test]
fn dispute_then_admin_resolves_in_favor_of_provider() {
    let (env, client, buyer, provider, platform, admin, token) = setup();
    let request_id = SorobanString::from_str(&env, "hire-3");

    client.lock(&request_id, &buyer, &provider, &token.address, &2_000, &platform, &0);
    client.dispute(&request_id, &buyer);
    assert_eq!(client.get_status(&request_id), EscrowStatus::Disputed);

    client.resolve_dispute(&request_id, &true);

    assert_eq!(token.balance(&provider), 2_000);
    assert_eq!(client.get_status(&request_id), EscrowStatus::Released);
    let _ = admin; // admin identity exercised via require_auth inside resolve_dispute
}

#[test]
fn cannot_lock_same_request_id_twice() {
    let (env, client, buyer, provider, platform, _admin, token) = setup();
    let request_id = SorobanString::from_str(&env, "hire-4");

    client.lock(&request_id, &buyer, &provider, &token.address, &1_000, &platform, &0);
    let result = client.try_lock(&request_id, &buyer, &provider, &token.address, &1_000, &platform, &0);
    assert!(result.is_err());
}

#[test]
fn cannot_release_before_lock() {
    let (env, client, _buyer, _provider, _platform, _admin, _token) = setup();
    let request_id = SorobanString::from_str(&env, "hire-5");

    let result = client.try_release(&request_id);
    assert!(result.is_err());
}

#[test]
fn fee_over_ceiling_is_rejected() {
    let (env, client, buyer, provider, platform, _admin, token) = setup();
    let request_id = SorobanString::from_str(&env, "hire-6");

    let result = client.try_lock(&request_id, &buyer, &provider, &token.address, &1_000, &platform, &2500);
    assert!(result.is_err());
}
