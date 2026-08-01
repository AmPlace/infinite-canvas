import { create } from "zustand";
import { persist } from "zustand/middleware";

import { defaultManagedSiteProfile, IS_MANAGED_DEPLOYMENT } from "@/constant/site-mode";
import type { ManagedBalance, ManagedFailureKind, ManagedPricingQuote, ManagedSiteProfile } from "@/lib/managed-site";

export type ManagedConnectionStatus = "idle" | "connecting" | "syncing" | "connected" | "unauthorized" | "error";
export type ManagedBalanceState = {
    status: "idle" | "loading" | "ready" | "unavailable";
    value?: ManagedBalance;
    errorKind?: ManagedFailureKind;
    lastFetchedAt: number;
};

type ManagedAuthorization = {
    granted: boolean;
    valid: boolean;
    channelId: string;
    authorizedAt: number;
};

type ManagedSiteStore = {
    managedEnabled: boolean;
    profile: ManagedSiteProfile;
    authorization: ManagedAuthorization;
    connectionStatus: ManagedConnectionStatus;
    connectionMessage: string;
    balance: ManagedBalanceState;
    pricingQuote?: ManagedPricingQuote;
    enableManagedMode: () => void;
    disableManagedMode: () => void;
    updateProfile: (profile: Partial<ManagedSiteProfile>) => void;
    grantAuthorization: (channelId: string) => void;
    clearAuthorization: () => void;
    markAuthorizationValid: (valid: boolean) => void;
    setConnection: (status: ManagedConnectionStatus, message?: string) => void;
    setBalance: (balance: ManagedBalanceState) => void;
    setPricingQuote: (pricingQuote?: ManagedPricingQuote) => void;
};

const defaultAuthorization: ManagedAuthorization = { granted: false, valid: false, channelId: "", authorizedAt: 0 };
const defaultBalance: ManagedBalanceState = { status: "idle", lastFetchedAt: 0 };

export const useManagedSiteStore = create<ManagedSiteStore>()(
    persist(
        (set) => ({
            managedEnabled: false,
            profile: defaultManagedSiteProfile,
            authorization: defaultAuthorization,
            connectionStatus: "idle",
            connectionMessage: "",
            balance: defaultBalance,
            pricingQuote: undefined,
            enableManagedMode: () => set({ managedEnabled: true }),
            disableManagedMode: () => set({ managedEnabled: false, connectionStatus: "idle", connectionMessage: "" }),
            updateProfile: (profile) => set((state) => ({ profile: { ...state.profile, ...profile } })),
            grantAuthorization: (channelId) =>
                set({
                    managedEnabled: true,
                    authorization: { granted: true, valid: true, channelId, authorizedAt: Date.now() },
                    balance: defaultBalance,
                }),
            clearAuthorization: () => set({ authorization: defaultAuthorization, connectionStatus: "idle", connectionMessage: "", balance: defaultBalance, pricingQuote: undefined }),
            markAuthorizationValid: (valid) => set((state) => ({ authorization: { ...state.authorization, valid } })),
            setConnection: (connectionStatus, connectionMessage = "") => set({ connectionStatus, connectionMessage }),
            setBalance: (balance) => set({ balance }),
            setPricingQuote: (pricingQuote) => set({ pricingQuote }),
        }),
        {
            name: "infinite-canvas:managed-site",
            partialize: (state) => ({ managedEnabled: state.managedEnabled, profile: state.profile, authorization: state.authorization, balance: state.balance }),
        },
    ),
);

export function isManagedSiteActive() {
    return IS_MANAGED_DEPLOYMENT || useManagedSiteStore.getState().managedEnabled;
}

export function useManagedSiteMode() {
    const managedEnabled = useManagedSiteStore((state) => state.managedEnabled);
    return IS_MANAGED_DEPLOYMENT || managedEnabled;
}
