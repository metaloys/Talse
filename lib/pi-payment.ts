"use client";

import { usePiAuth } from "@/contexts/pi-auth-context";
import type {
  ConsumeResponse,
  PurchaseResult,
  PurchasesResponse,
  RestoreOptions,
  SDKLiteError,
  UserPurchaseBalance,
  UserStateRecord,
} from "@/lib/sdklite-types";

export type {
  ConsumeResponse,
  PurchaseResult,
  PurchasesResponse,
  RestoreOptions,
  SDKLiteError,
  UserPurchaseBalance,
  UserStateRecord,
};

export function usePurchase() {
  const { sdk } = usePiAuth();

  const makePurchase = async (productId: string): Promise<PurchaseResult> => {
    if (!sdk) throw new Error("SDK not initialized");
    return sdk.makePurchase(productId);
  };

  return { makePurchase };
}

export function useAds() {
  const { sdk } = usePiAuth();

  const isAdNetworkSupported = async (): Promise<boolean> => {
    if (!sdk) return false;
    return sdk.isAdNetworkSupported();
  };

  const showInterstitial = async (): Promise<boolean> => {
    if (!sdk) return false;
    return sdk.showInterstitial();
  };

  const showRewarded = async (productId: string): Promise<boolean> => {
    if (!sdk) return false;
    return sdk.showRewarded(productId);
  };

  return { isAdNetworkSupported, showInterstitial, showRewarded };
}

export function useUserState() {
  const { sdk } = usePiAuth();

  const get = async (key: string): Promise<UserStateRecord | null> => {
    if (!sdk) throw new Error("SDK not initialized");
    return sdk.state.get(key);
  };

  const set = async (
    key: string,
    blob: Record<string, unknown>
  ): Promise<void> => {
    if (!sdk) throw new Error("SDK not initialized");
    return sdk.state.set(key, blob);
  };

  const purchases = async (): Promise<PurchasesResponse> => {
    if (!sdk) throw new Error("SDK not initialized");
    return sdk.state.purchases();
  };

  const consume = async (
    productId: string,
    quantity?: number
  ): Promise<ConsumeResponse> => {
    if (!sdk) throw new Error("SDK not initialized");
    return sdk.state.consume(productId, quantity);
  };

  const restore = async (
    options?: RestoreOptions
  ): Promise<PurchasesResponse> => {
    if (!sdk) throw new Error("SDK not initialized");
    return sdk.state.restore(options);
  };

  return { get, set, purchases, consume, restore };
}
