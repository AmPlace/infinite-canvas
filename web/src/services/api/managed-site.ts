import axios from "axios";

import { buildManagedStatusUrl, classifyManagedFailure, managedProfileFromStatus, parseManagedBalance, type ManagedBalance, type ManagedFailureKind, type ManagedSiteProfile } from "@/lib/managed-site";
import { buildApiUrl, type ModelChannel } from "@/stores/use-config-store";

export type ManagedBalanceResult = {
    balance: ManagedBalance;
    profile: Partial<ManagedSiteProfile>;
};

export class ManagedSiteRequestError extends Error {
    kind: ManagedFailureKind;

    constructor(kind: ManagedFailureKind, message?: string) {
        super(message || kind);
        this.name = "ManagedSiteRequestError";
        this.kind = kind;
    }
}

export async function fetchManagedBalance(channel: ModelChannel, profile: ManagedSiteProfile): Promise<ManagedBalanceResult> {
    const statusUrl = buildManagedStatusUrl(channel.baseUrl);
    const headers = { Authorization: `Bearer ${channel.apiKey}` };
    const statusPromise = statusUrl
        ? axios
              .get(statusUrl, { timeout: 8_000 })
              .then((response) => response.data)
              .catch(() => undefined)
        : Promise.resolve(undefined);
    const usagePromise = axios
        .get(buildApiUrl(channel.baseUrl, "/dashboard/billing/usage"), {
            headers,
            timeout: 10_000,
            params: managedUsageDateRange(),
        })
        .then((response) => response.data)
        .catch(() => undefined);
    try {
        const [subscription, siteStatus, usage] = await Promise.all([
            axios
                .get(buildApiUrl(channel.baseUrl, "/dashboard/billing/subscription"), {
                    headers,
                    timeout: 10_000,
                })
                .then((response) => response.data),
            statusPromise,
            usagePromise,
        ]);
        const parsed = parseManagedBalance(subscription, siteStatus, profile, usage);
        if (!parsed.ok) throw new ManagedSiteRequestError(parsed.reason);
        return {
            balance: parsed.balance,
            profile: managedProfileFromStatus(siteStatus, channel.baseUrl),
        };
    } catch (error) {
        if (error instanceof ManagedSiteRequestError) throw error;
        if (axios.isAxiosError(error)) {
            throw new ManagedSiteRequestError(
                classifyManagedFailure({
                    status: error.response?.status,
                    code: error.code,
                    message: readManagedApiError(error.response?.data) || error.message,
                }),
            );
        }
        throw new ManagedSiteRequestError(classifyManagedFailure({ message: error instanceof Error ? error.message : "" }));
    }
}

function managedUsageDateRange() {
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const start = `${end.slice(0, 7)}-01`;
    return { start_date: start, end_date: end };
}

function readManagedApiError(payload: unknown): string {
    if (typeof payload === "string") return payload;
    if (!payload || typeof payload !== "object") return "";
    const record = payload as Record<string, unknown>;
    const error = record.error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") return String((error as Record<string, unknown>).message);
    return [record.message, record.msg].find((value): value is string => typeof value === "string") || "";
}
