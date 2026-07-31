import { resolveManagedDeploymentMode, safeHttpUrl, type ManagedSiteProfile } from "@/lib/managed-site";

export const SITE_DEPLOYMENT_MODE = resolveManagedDeploymentMode(import.meta.env.PROD, import.meta.env.VITE_SITE_MODE);
export const IS_MANAGED_DEPLOYMENT = SITE_DEPLOYMENT_MODE === "managed";

export const defaultManagedSiteProfile: ManagedSiteProfile = {
    siteName: import.meta.env.VITE_MANAGED_SITE_NAME?.trim() || "阿柴 AI",
    logoUrl: safeHttpUrl(import.meta.env.VITE_MANAGED_LOGO_URL) || "/logo.svg",
    homeUrl: safeHttpUrl(import.meta.env.VITE_MANAGED_HOME_URL) || "https://www.achai.cc/",
    consoleUrl: safeHttpUrl(import.meta.env.VITE_MANAGED_CONSOLE_URL) || "https://www.achai.cc/dashboard",
    rechargeUrl: safeHttpUrl(import.meta.env.VITE_MANAGED_RECHARGE_URL) || "https://www.achai.cc/wallet",
    currency: "CNY",
    currencySymbol: "¥",
};

export const siteCapabilities = {
    managedDeployment: IS_MANAGED_DEPLOYMENT,
    apiConfiguration: !IS_MANAGED_DEPLOYMENT,
} as const;
