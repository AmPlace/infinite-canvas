import { useCallback } from "react";

import { useConfigStore, withModelChannels } from "@/stores/use-config-store";
import { useManagedSiteStore } from "@/stores/use-managed-site-store";

export function useClearManagedAuthorization() {
    const clearAuthorization = useManagedSiteStore((state) => state.clearAuthorization);
    return useCallback(() => {
        const authorization = useManagedSiteStore.getState().authorization;
        const { config, setConfig } = useConfigStore.getState();
        const authorizedChannel = config.channels.find((channel) => channel.id === authorization.channelId);
        if (authorizedChannel) {
            const channels = config.channels.map((channel) => (channel.id === authorizedChannel.id ? { ...channel, apiKey: "", models: [] } : channel));
            const nextConfig = withModelChannels(config, channels);
            setConfig(config.apiKey === authorizedChannel.apiKey ? { ...nextConfig, apiKey: "" } : nextConfig);
        }
        clearAuthorization();
    }, [clearAuthorization]);
}
