import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";

import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";
import { defaultManagedSiteProfile, IS_MANAGED_DEPLOYMENT } from "@/constant/site-mode";
import { classifyManagedFailure, managedFailureMessage, MANAGED_SITE_PARAM_KEYS, normalizeManagedCredentials, readManagedSiteImport, shouldInvalidateManagedAuthorization } from "@/lib/managed-site";
import { fetchChannelModels } from "@/services/api/image";
import { createModelChannel, syncChannelModelNames, useConfigStore, withModelChannels } from "@/stores/use-config-store";
import { useManagedSiteStore } from "@/stores/use-managed-site-store";
import { ManagedSiteRuntime } from "@/components/layout/managed-site-runtime";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const config = useConfigStore((state) => state.config);
    const setConfig = useConfigStore((state) => state.setConfig);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);

    usePromptSourceScheduler();

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const importedBaseUrl = (searchParams.get("baseUrl") || searchParams.get("baseurl") || "").trim();
        const importedApiKey = (searchParams.get("apiKey") || searchParams.get("apikey") || "").trim();
        const managedImport = readManagedSiteImport(searchParams, importedBaseUrl, defaultManagedSiteProfile);
        if (!IS_MANAGED_DEPLOYMENT && managedImport.explicitMode && !managedImport.managed) useManagedSiteStore.getState().disableManagedMode();
        const managed = IS_MANAGED_DEPLOYMENT || managedImport.managed || useManagedSiteStore.getState().managedEnabled;
        if (managedImport.managed) useManagedSiteStore.getState().enableManagedMode();
        if (managed && Object.keys(managedImport.profile).length) useManagedSiteStore.getState().updateProfile(managedImport.profile);
        if (!importedBaseUrl && !importedApiKey) {
            if (managedImport.managed || Object.keys(managedImport.profile).length) {
                handledConfigParams.current = true;
                MANAGED_SITE_PARAM_KEYS.forEach((key) => searchParams.delete(key));
                window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
            }
            return;
        }
        const managedCredentials = managed ? normalizeManagedCredentials(importedBaseUrl, importedApiKey) : null;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        MANAGED_SITE_PARAM_KEYS.forEach((key) => searchParams.delete(key));
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        if (managed && !managedCredentials) {
            setConfigDialogOpen(false);
            const content = "授权参数不完整，请从阿柴 AI 控制台重新进入创作台";
            useManagedSiteStore.getState().setConnection("error", content);
            message.error(content);
            return;
        }
        const baseUrl = managedCredentials?.baseUrl || importedBaseUrl;
        const apiKey = managedCredentials?.apiKey || importedApiKey;
        const firstChannel = config.channels[0];
        const siteName = managedImport.profile.siteName || useManagedSiteStore.getState().profile.siteName;
        const importedChannel = firstChannel
            ? {
                  ...firstChannel,
                  ...(managed ? { name: siteName } : {}),
                  ...(baseUrl ? { baseUrl } : {}),
                  ...(apiKey ? { apiKey } : {}),
                  apiFormat: "openai" as const,
              }
            : createModelChannel({ id: "default", name: managed ? siteName : "默认渠道", baseUrl: baseUrl || undefined, apiKey, apiFormat: "openai" });
        const importedChannels = firstChannel ? [importedChannel, ...config.channels.slice(1)] : [importedChannel];
        const channelsBeforeSync = managed ? [syncChannelModelNames(importedChannel, []), ...importedChannels.slice(1)] : importedChannels;
        setConfig(withModelChannels(config, channelsBeforeSync));
        setConfigDialogOpen(false);
        if (managed) {
            useManagedSiteStore.getState().grantAuthorization(importedChannel.id);
            useManagedSiteStore.getState().setConnection("syncing", "正在同步模型");
            message.loading({ key: "api-import", content: `正在连接${siteName}并同步可用模型…`, duration: 0 });
        } else {
            message.loading({ key: "api-import", content: "API 配置已导入，正在同步可用模型…", duration: 0 });
        }

        void fetchChannelModels(importedChannel)
            .then((names) => {
                if (!names.length) throw new Error("当前 Key 未返回可用模型");
                const latestConfig = useConfigStore.getState().config;
                const currentChannel = latestConfig.channels.find((channel) => channel.id === importedChannel.id);
                if (!currentChannel || currentChannel.baseUrl !== importedChannel.baseUrl || currentChannel.apiKey !== importedChannel.apiKey || currentChannel.apiFormat !== importedChannel.apiFormat) {
                    if (managed) {
                        const content = "授权信息已发生变化，请从阿柴 AI 控制台重新进入创作台";
                        useManagedSiteStore.getState().setConnection("error", content);
                        message.warning({ key: "api-import", content });
                    } else {
                        message.info({ key: "api-import", content: "渠道配置已发生变化，已取消应用本次模型同步结果" });
                    }
                    return;
                }
                const syncedChannel = syncChannelModelNames(managed ? { ...currentChannel, models: importedChannel.models } : currentChannel, names);
                const syncedChannels = latestConfig.channels.map((channel) => (channel.id === syncedChannel.id ? syncedChannel : channel));
                useConfigStore.getState().setConfig(withModelChannels(latestConfig, syncedChannels));
                if (managed) {
                    const hasImage = syncedChannel.models.some((model) => model.capability === "image");
                    const hasVideo = syncedChannel.models.some((model) => model.capability === "video");
                    const statusMessage = !hasImage && !hasVideo ? "当前 Key 无生图或视频模型" : !hasImage ? "已连接，当前 Key 无生图模型" : !hasVideo ? "已连接，当前 Key 无视频模型" : "已连接";
                    useManagedSiteStore.getState().setConnection(hasImage || hasVideo ? "connected" : "error", statusMessage);
                    message[hasImage || hasVideo ? "success" : "warning"]({ key: "api-import", content: statusMessage });
                } else {
                    message.success({ key: "api-import", content: `API 配置已导入，已同步 ${syncedChannel.models.length} 个模型` });
                }
            })
            .catch((error) => {
                const reason = error instanceof Error ? error.message : "未知错误";
                if (managed) {
                    const kind = classifyManagedFailure({ message: reason });
                    if (shouldInvalidateManagedAuthorization("model_sync", kind)) useManagedSiteStore.getState().markAuthorizationValid(false);
                    const friendlyMessage = kind === "unauthorized" ? managedFailureMessage(kind) : "模型同步失败，请稍后从阿柴 AI 控制台重新进入";
                    useManagedSiteStore.getState().setConnection(kind === "unauthorized" ? "unauthorized" : "error", friendlyMessage);
                    message.error({ key: "api-import", content: friendlyMessage, duration: 6 });
                } else {
                    message.error({ key: "api-import", content: `API 配置已保留，但自动同步模型失败：${reason}。可在配置中手动拉取。`, duration: 6 });
                }
            });
    }, [config, message, setConfig, setConfigDialogOpen]);

    return (
        <>
            <ManagedSiteRuntime />
            {children}
        </>
    );
}
