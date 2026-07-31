import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";

import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";
import { fetchChannelModels } from "@/services/api/image";
import { createModelChannel, syncChannelModelNames, useConfigStore, withModelChannels } from "@/stores/use-config-store";

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
        const baseUrl = (searchParams.get("baseUrl") || searchParams.get("baseurl") || "").trim();
        const apiKey = (searchParams.get("apiKey") || searchParams.get("apikey") || "").trim();
        if (!baseUrl && !apiKey) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        const firstChannel = config.channels[0];
        const importedChannel = firstChannel
            ? {
                  ...firstChannel,
                  ...(baseUrl ? { baseUrl } : {}),
                  ...(apiKey ? { apiKey } : {}),
                  apiFormat: "openai" as const,
              }
            : createModelChannel({ id: "default", name: "默认渠道", baseUrl: baseUrl || undefined, apiKey, apiFormat: "openai" });
        const importedChannels = firstChannel ? [importedChannel, ...config.channels.slice(1)] : [importedChannel];
        setConfig(withModelChannels(config, importedChannels));
        setConfigDialogOpen(false);
        message.loading({ key: "api-import", content: "API 配置已导入，正在同步可用模型…", duration: 0 });

        void fetchChannelModels(importedChannel)
            .then((names) => {
                if (!names.length) throw new Error("当前 Key 未返回可用模型");
                const latestConfig = useConfigStore.getState().config;
                const currentChannel = latestConfig.channels.find((channel) => channel.id === importedChannel.id);
                if (!currentChannel || currentChannel.baseUrl !== importedChannel.baseUrl || currentChannel.apiKey !== importedChannel.apiKey || currentChannel.apiFormat !== importedChannel.apiFormat) {
                    message.info({ key: "api-import", content: "渠道配置已发生变化，已取消应用本次模型同步结果" });
                    return;
                }
                const syncedChannel = syncChannelModelNames(currentChannel, names);
                const syncedChannels = latestConfig.channels.map((channel) => (channel.id === syncedChannel.id ? syncedChannel : channel));
                useConfigStore.getState().setConfig(withModelChannels(latestConfig, syncedChannels));
                message.success({ key: "api-import", content: `API 配置已导入，已同步 ${syncedChannel.models.length} 个模型` });
            })
            .catch((error) => {
                const reason = error instanceof Error ? error.message : "未知错误";
                message.error({ key: "api-import", content: `API 配置已保留，但自动同步模型失败：${reason}。可在配置中手动拉取。`, duration: 6 });
            });
    }, [config, message, setConfig, setConfigDialogOpen]);

    return <>{children}</>;
}
