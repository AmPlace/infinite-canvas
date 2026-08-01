export type ManagedCurrency = "USD" | "CNY" | "TOKENS" | "CUSTOM" | "UNKNOWN";
export type ManagedFailureKind = "unauthorized" | "insufficient_balance" | "timeout" | "unsupported" | "busy" | "unavailable" | "missing_data";
export type ManagedRequestSource = "balance" | "generation" | "model_sync";
export type ManagedBalanceRefreshReason = "initial" | "manual" | "focus" | "generation";

export type ManagedSiteProfile = {
    siteName: string;
    logoUrl: string;
    homeUrl: string;
    consoleUrl: string;
    rechargeUrl: string;
    currency: ManagedCurrency;
    currencySymbol: string;
};

export type ManagedBalance = {
    amount?: number;
    currency: ManagedCurrency;
    symbol: string;
    displayText: string;
    unlimited: boolean;
    low: boolean;
};

export type ManagedPricingQuote = {
    model: string;
    estimatedCost?: ManagedBalance;
    actualCost?: ManagedBalance;
    labels?: string[];
    campaignText?: string;
};

export type ManagedSiteImport = {
    managed: boolean;
    explicitMode: boolean;
    profile: Partial<ManagedSiteProfile>;
};

export const MANAGED_BALANCE_REFRESH_EVENT = "infinite-canvas:managed-balance-refresh";
export const MANAGED_SITE_PARAM_KEYS = ["managed", "siteName", "site_name", "logoUrl", "logo_url", "logo", "homeUrl", "home_url", "consoleUrl", "console_url", "rechargeUrl", "recharge_url", "currency", "currencySymbol", "currency_symbol"] as const;

export function resolveManagedDeploymentMode(isProduction: boolean, configuredMode?: string) {
    if (isProduction) return "managed" as const;
    return configuredMode?.trim().toLowerCase() === "managed" ? ("managed" as const) : ("standalone" as const);
}

export function safeHttpUrl(value: unknown, baseUrl?: string) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = baseUrl ? new URL(value.trim(), baseUrl) : new URL(value.trim());
        return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
    } catch {
        return "";
    }
}

export function normalizeManagedCredentials(baseUrl: string, apiKey: string) {
    const safeBaseUrl = safeHttpUrl(baseUrl);
    const safeApiKey = apiKey.trim();
    return safeBaseUrl && safeApiKey ? { baseUrl: safeBaseUrl, apiKey: safeApiKey } : null;
}

export function deriveManagedSiteLinks(baseUrl: string) {
    const safeBaseUrl = safeHttpUrl(baseUrl);
    if (!safeBaseUrl) return { homeUrl: "", consoleUrl: "", rechargeUrl: "" };
    const origin = new URL(safeBaseUrl).origin;
    return {
        homeUrl: `${origin}/`,
        consoleUrl: `${origin}/dashboard`,
        rechargeUrl: `${origin}/wallet`,
    };
}

export function buildManagedStatusUrl(baseUrl: string) {
    const safeBaseUrl = safeHttpUrl(baseUrl);
    if (!safeBaseUrl) return "";
    const url = new URL(safeBaseUrl);
    let path = url.pathname.replace(/\/+$/, "");
    path = path.replace(/\/v1$/i, "");
    url.pathname = `${path}/api/status`.replace(/\/{2,}/g, "/");
    url.search = "";
    url.hash = "";
    return url.toString();
}

export function readManagedSiteImport(searchParams: URLSearchParams, baseUrl: string, defaults: ManagedSiteProfile): ManagedSiteImport {
    const managedValue = searchParams.get("managed")?.trim().toLowerCase();
    const managed = managedValue === "1" || managedValue === "true";
    const explicitMode = managedValue !== undefined;
    const hasSiteParams = MANAGED_SITE_PARAM_KEYS.some((key) => searchParams.has(key));
    if (!baseUrl.trim() && !hasSiteParams) return { managed, explicitMode, profile: {} };
    const derived = deriveManagedSiteLinks(baseUrl);
    const urlBase = safeHttpUrl(baseUrl) || derived.homeUrl || defaults.homeUrl;
    const read = (...keys: string[]) =>
        keys
            .map((key) => searchParams.get(key))
            .find((value) => typeof value === "string" && value.trim())
            ?.trim() || "";
    const siteName = read("siteName", "site_name");
    const logoUrl = safeHttpUrl(read("logoUrl", "logo_url", "logo"), urlBase);
    const homeUrl = safeHttpUrl(read("homeUrl", "home_url"), urlBase) || derived.homeUrl || defaults.homeUrl;
    const consoleUrl = safeHttpUrl(read("consoleUrl", "console_url"), urlBase) || derived.consoleUrl || defaults.consoleUrl;
    const rechargeUrl = safeHttpUrl(read("rechargeUrl", "recharge_url"), urlBase) || derived.rechargeUrl || defaults.rechargeUrl;
    const currency = normalizeManagedCurrency(read("currency"));
    const currencySymbol = read("currencySymbol", "currency_symbol");
    return {
        managed,
        explicitMode,
        profile: {
            ...(siteName ? { siteName } : {}),
            ...(logoUrl ? { logoUrl } : {}),
            ...(homeUrl ? { homeUrl } : {}),
            ...(consoleUrl ? { consoleUrl } : {}),
            ...(rechargeUrl ? { rechargeUrl } : {}),
            ...(currency !== "UNKNOWN" ? { currency } : {}),
            ...(currencySymbol ? { currencySymbol } : {}),
        },
    };
}

export function parseManagedBalance(payload: unknown, siteConfig?: unknown, profile?: Partial<ManagedSiteProfile>, usagePayload?: unknown): { ok: true; balance: ManagedBalance } | { ok: false; reason: ManagedFailureKind } {
    const envelope = asRecord(payload);
    if (envelope.error) return { ok: false, reason: classifyManagedFailure({ message: readErrorMessage(envelope.error) }) };
    const body = hasBalanceField(envelope) ? envelope : asRecord(envelope.data);
    const directAmount = firstFiniteNumber(body.balance, body.remaining, body.total_available, body.available, body.quota);
    const hardLimit = firstFiniteNumber(body.hard_limit_usd);
    const usageEnvelope = asRecord(usagePayload);
    const usage = Object.keys(asRecord(usageEnvelope.data)).length ? asRecord(usageEnvelope.data) : usageEnvelope;
    const totalUsage = firstFiniteNumber(usage.total_usage);
    const amount = directAmount ?? (hardLimit !== undefined && totalUsage !== undefined ? hardLimit - totalUsage / 100 : hardLimit);
    const unlimited = readBoolean(body.unlimited_quota) || readBoolean(body.unlimited) || readBoolean(body.is_unlimited) || (hardLimit !== undefined && hardLimit >= 100_000_000);
    if (amount === undefined && !unlimited) return { ok: false, reason: "missing_data" };

    const settingsEnvelope = asRecord(siteConfig);
    const settings = Object.keys(asRecord(settingsEnvelope.data)).length ? asRecord(settingsEnvelope.data) : settingsEnvelope;
    const currency = normalizeManagedCurrency(body.currency || body.quota_display_type || settings.quota_display_type || profile?.currency);
    const configuredSymbol = firstString(body.currency_symbol, body.symbol, settings.custom_currency_symbol, profile?.currencySymbol);
    const symbol = currency === "USD" ? "$" : currency === "CNY" ? "¥" : currency === "CUSTOM" ? configuredSymbol : "";
    const safeAmount = amount === undefined ? undefined : Math.max(0, amount);
    const displayText = unlimited ? "无限额度" : formatManagedBalance(safeAmount || 0, currency, symbol);
    return {
        ok: true,
        balance: {
            amount: safeAmount,
            currency,
            symbol,
            displayText,
            unlimited,
            low: !unlimited && (safeAmount || 0) <= 0,
        },
    };
}

export function managedProfileFromStatus(payload: unknown, baseUrl: string): Partial<ManagedSiteProfile> {
    const envelope = asRecord(payload);
    const data = Object.keys(asRecord(envelope.data)).length ? asRecord(envelope.data) : envelope;
    const siteName = firstString(data.system_name, data.site_name);
    const logoUrl = safeHttpUrl(firstString(data.logo, data.logo_url), safeHttpUrl(baseUrl));
    const currency = normalizeManagedCurrency(data.quota_display_type);
    const currencySymbol = firstString(data.custom_currency_symbol);
    return {
        ...(siteName ? { siteName } : {}),
        ...(logoUrl ? { logoUrl } : {}),
        ...(currency !== "UNKNOWN" ? { currency } : {}),
        ...(currencySymbol ? { currencySymbol } : {}),
    };
}

export function classifyManagedFailure(input: { status?: number; code?: string; message?: string }): ManagedFailureKind {
    const text = `${input.code || ""} ${input.message || ""}`.toLowerCase();
    if (input.status === 401 || input.status === 403 || /(?:http|status(?: code)?)?\s*(?:401|403)\b|unauthor|forbidden|invalid.*key|鉴权|授权.*失效|登录.*失效/.test(text)) return "unauthorized";
    if (input.status === 404 || input.status === 405 || input.status === 501 || /http\s*(?:404|405|501)/.test(text)) return "unsupported";
    if (input.status === 402 || /insufficient|balance|quota.*(exceed|lack|不足)|余额不足|额度不足/.test(text)) return "insufficient_balance";
    if (input.status === 429 || /rate.?limit|限流|http\s*(?:429|5\d\d)/.test(text)) return "busy";
    if (/timeout|timed out|econnaborted|超时/.test(text)) return "timeout";
    if ((input.status !== undefined && input.status >= 500) || /busy|繁忙|网关/.test(text)) return "busy";
    return "unavailable";
}

export function shouldInvalidateManagedAuthorization(source: ManagedRequestSource, kind: ManagedFailureKind) {
    return source !== "balance" && kind === "unauthorized";
}

export function managedFailureMessage(kind: ManagedFailureKind, context: "balance" | "generation" = "generation") {
    if (kind === "unauthorized") return "登录或授权已失效，请从阿柴 AI 控制台重新进入创作台";
    if (kind === "insufficient_balance") return "余额不足，请充值后再试";
    if (kind === "timeout" || kind === "busy") return "服务暂时繁忙，请稍后重试";
    if (context === "balance" && (kind === "missing_data" || kind === "unsupported")) return "余额暂不可用";
    return "服务暂不可用，请稍后重试";
}

export function toManagedUserMessage(message: string) {
    if (/^请求已取消$/.test(message.trim())) return message;
    const kind = classifyManagedFailure({ message });
    return managedFailureMessage(kind);
}

export function isManagedCreativePath(pathname: string) {
    return pathname === "/image" || pathname === "/video" || pathname === "/prompts" || pathname === "/assets" || pathname === "/canvas" || /^\/canvas\/[^/]+$/.test(pathname);
}

export function notifyManagedGenerationSettled(success: boolean, error?: unknown) {
    if (typeof window === "undefined") return;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    window.dispatchEvent(new CustomEvent(MANAGED_BALANCE_REFRESH_EVENT, { detail: { reason: "generation" satisfies ManagedBalanceRefreshReason, success, message } }));
}

export function requestManagedBalanceRefresh(reason: ManagedBalanceRefreshReason = "manual") {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(MANAGED_BALANCE_REFRESH_EVENT, { detail: { reason } }));
}

function normalizeManagedCurrency(value: unknown): ManagedCurrency {
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (normalized === "USD" || normalized === "CNY" || normalized === "TOKENS" || normalized === "CUSTOM") return normalized;
    return "UNKNOWN";
}

function formatManagedBalance(amount: number, currency: ManagedCurrency, symbol: string) {
    if (currency === "TOKENS") return `${new Intl.NumberFormat("zh-CN", { notation: amount >= 100_000 ? "compact" : "standard", maximumFractionDigits: 2 }).format(amount)} 额度`;
    const value = new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    if (currency === "UNKNOWN" || (currency === "CUSTOM" && !symbol)) return `${value} 额度`;
    return `${symbol}${value}`;
}

function hasBalanceField(value: Record<string, unknown>) {
    return ["hard_limit_usd", "balance", "remaining", "total_available", "available", "quota", "unlimited_quota", "unlimited", "is_unlimited"].some((key) => key in value);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readBoolean(value: unknown) {
    return value === true || value === 1 || (typeof value === "string" && ["true", "1", "yes"].includes(value.trim().toLowerCase()));
}

function firstFiniteNumber(...values: unknown[]) {
    for (const value of values) {
        const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
        if (Number.isFinite(number)) return number;
    }
    return undefined;
}

function firstString(...values: unknown[]) {
    return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim() || "";
}

function readErrorMessage(value: unknown): string {
    if (typeof value === "string") return value;
    const record = asRecord(value);
    return firstString(record.message, record.msg, record.type, record.code);
}
