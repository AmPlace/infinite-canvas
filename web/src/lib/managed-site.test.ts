import assert from "node:assert/strict";
import test from "node:test";

import {
    buildManagedStatusUrl,
    classifyManagedFailure,
    deriveManagedSiteLinks,
    isManagedCreativePath,
    managedFailureMessage,
    normalizeManagedCredentials,
    parseManagedBalance,
    readManagedSiteImport,
    resolveManagedDeploymentMode,
    safeHttpUrl,
    shouldInvalidateManagedAuthorization,
    toManagedUserMessage,
    type ManagedSiteProfile,
} from "./managed-site.ts";

const defaults: ManagedSiteProfile = {
    siteName: "阿柴 AI",
    logoUrl: "/logo.svg",
    homeUrl: "https://www.achai.cc/",
    consoleUrl: "https://www.achai.cc/dashboard",
    rechargeUrl: "https://www.achai.cc/wallet",
    currency: "CNY",
    currencySymbol: "¥",
};

test("production deployment always uses managed mode", () => {
    assert.equal(resolveManagedDeploymentMode(true, "standalone"), "managed");
    assert.equal(resolveManagedDeploymentMode(false, "standalone"), "standalone");
    assert.equal(resolveManagedDeploymentMode(false, "managed"), "managed");
    const localExit = readManagedSiteImport(new URLSearchParams({ managed: "0" }), "", defaults);
    assert.equal(localExit.explicitMode, true);
    assert.equal(localExit.managed, false);
});

test("managed mode keeps creative pages while blocking API configuration", () => {
    assert.equal(isManagedCreativePath("/image"), true);
    assert.equal(isManagedCreativePath("/video"), true);
    assert.equal(isManagedCreativePath("/prompts"), true);
    assert.equal(isManagedCreativePath("/assets"), true);
    assert.equal(isManagedCreativePath("/canvas"), true);
    assert.equal(isManagedCreativePath("/canvas/project-test"), true);
    assert.equal(isManagedCreativePath("/config"), false);
});

test("managed import keeps safe site links and rejects script protocols", () => {
    const params = new URLSearchParams({
        managed: "1",
        siteName: "测试站点",
        consoleUrl: "javascript:alert(1)",
        rechargeUrl: "https://pay.example.com/wallet",
        logoUrl: "/logo.png",
    });
    const result = readManagedSiteImport(params, "https://api.example.com/v1", defaults);
    assert.equal(result.managed, true);
    assert.equal(result.explicitMode, true);
    assert.equal(result.profile.siteName, "测试站点");
    assert.equal(result.profile.consoleUrl, "https://api.example.com/dashboard");
    assert.equal(result.profile.rechargeUrl, "https://pay.example.com/wallet");
    assert.equal(result.profile.logoUrl, "https://api.example.com/logo.png");
    assert.equal(safeHttpUrl("data:text/html,test"), "");
    assert.deepEqual(normalizeManagedCredentials("https://api.example.com/v1", " sk-test "), { baseUrl: "https://api.example.com/v1", apiKey: "sk-test" });
    assert.equal(normalizeManagedCredentials("javascript:alert(1)", "sk-test"), null);
    assert.equal(normalizeManagedCredentials("https://api.example.com", ""), null);
});

test("site links and status endpoint derive from root or v1 Base URL", () => {
    assert.deepEqual(deriveManagedSiteLinks("https://api.example.com/v1"), {
        homeUrl: "https://api.example.com/",
        consoleUrl: "https://api.example.com/dashboard",
        rechargeUrl: "https://api.example.com/wallet",
    });
    assert.equal(buildManagedStatusUrl("https://api.example.com"), "https://api.example.com/api/status");
    assert.equal(buildManagedStatusUrl("https://api.example.com/v1"), "https://api.example.com/api/status");
});

test("balance parser follows NewAPI CNY, token and custom display settings", () => {
    const cny = parseManagedBalance({ hard_limit_usd: 26.35 }, { data: { quota_display_type: "CNY" } }, defaults);
    assert.equal(cny.ok, true);
    if (cny.ok) {
        assert.equal(cny.balance.displayText, "¥26.35");
        assert.equal(cny.balance.low, false);
    }

    const tokens = parseManagedBalance({ hard_limit_usd: "500000" }, { data: { quota_display_type: "TOKENS" } }, defaults);
    assert.equal(tokens.ok, true);
    if (tokens.ok) assert.match(tokens.balance.displayText, /额度$/);

    const custom = parseManagedBalance({ balance: 8 }, { data: { quota_display_type: "CUSTOM", custom_currency_symbol: "点" } }, defaults);
    assert.equal(custom.ok, true);
    if (custom.ok) assert.equal(custom.balance.displayText, "点8.00");

    const customWithoutSymbol = parseManagedBalance({ balance: 8, quota_display_type: "CUSTOM" }, undefined, { ...defaults, currencySymbol: "" });
    assert.equal(customWithoutSymbol.ok, true);
    if (customWithoutSymbol.ok) assert.equal(customWithoutSymbol.balance.displayText, "8.00 额度");
});

test("balance parser handles unlimited, zero and missing fields without guessing", () => {
    const unlimited = parseManagedBalance({ hard_limit_usd: 100_000_000 }, { data: { quota_display_type: "USD" } }, defaults);
    assert.equal(unlimited.ok, true);
    if (unlimited.ok) assert.equal(unlimited.balance.displayText, "无限额度");

    const zero = parseManagedBalance({ hard_limit_usd: 0 }, { data: { quota_display_type: "CNY" } }, defaults);
    assert.equal(zero.ok, true);
    if (zero.ok) assert.equal(zero.balance.low, true);

    assert.deepEqual(parseManagedBalance({ object: "billing_subscription" }, undefined, defaults), { ok: false, reason: "missing_data" });
});

test("NewAPI subscription total is reduced by reported usage when available", () => {
    const result = parseManagedBalance({ hard_limit_usd: 30 }, { data: { quota_display_type: "CNY" } }, defaults, { total_usage: 365 });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.balance.displayText, "¥26.35");
});

test("managed failures degrade to user-facing states", () => {
    assert.equal(classifyManagedFailure({ status: 401 }), "unauthorized");
    assert.equal(classifyManagedFailure({ message: "Request failed with status code 401" }), "unauthorized");
    assert.equal(classifyManagedFailure({ message: "timeout of 10000ms exceeded" }), "timeout");
    assert.equal(classifyManagedFailure({ status: 404 }), "unsupported");
    assert.equal(classifyManagedFailure({ status: 503 }), "busy");
    assert.equal(classifyManagedFailure({ message: "rate limit exceeded" }), "busy");
    assert.equal(classifyManagedFailure({ message: "insufficient quota" }), "insufficient_balance");
    assert.equal(classifyManagedFailure({ status: 429, message: "insufficient quota" }), "insufficient_balance");
    assert.equal(shouldInvalidateManagedAuthorization("balance", "unauthorized"), false);
    assert.equal(shouldInvalidateManagedAuthorization("generation", "unauthorized"), true);
    assert.equal(shouldInvalidateManagedAuthorization("model_sync", "unauthorized"), true);
    assert.equal(managedFailureMessage("unauthorized"), "登录或授权已失效，请从阿柴 AI 控制台重新进入创作台");
    assert.equal(managedFailureMessage("unsupported", "balance"), "余额暂不可用");
    assert.equal(managedFailureMessage("unsupported"), "服务暂不可用，请稍后重试");
    assert.equal(toManagedUserMessage("请求失败（HTTP 503），请检查 Base URL 和 API Key 是否正确"), "服务暂时繁忙，请稍后重试");
    assert.equal(toManagedUserMessage("insufficient quota"), "余额不足，请充值后再试");
    assert.equal(toManagedUserMessage("Network Error"), "服务暂不可用，请稍后重试");
});
