import { useCallback, useEffect, useMemo, useRef } from "react";
import { App } from "antd";

import { classifyManagedFailure, managedFailureMessage, MANAGED_BALANCE_REFRESH_EVENT, shouldInvalidateManagedAuthorization, type ManagedBalanceRefreshReason } from "@/lib/managed-site";
import { fetchChannelModels } from "@/services/api/image";
import { fetchManagedBalance, ManagedSiteRequestError } from "@/services/api/managed-site";
import { syncChannelModelNames, useConfigStore, withModelChannels } from "@/stores/use-config-store";
import { useManagedSiteMode, useManagedSiteStore } from "@/stores/use-managed-site-store";

const FOCUS_REFRESH_INTERVAL = 30_000;
const GENERATION_REFRESH_DELAY = 1_500;

export function ManagedSiteRuntime() {
    const { message } = App.useApp();
    const managed = useManagedSiteMode();
    const config = useConfigStore((state) => state.config);
    const authorization = useManagedSiteStore((state) => state.authorization);
    const profile = useManagedSiteStore((state) => state.profile);
    const setBalance = useManagedSiteStore((state) => state.setBalance);
    const updateProfile = useManagedSiteStore((state) => state.updateProfile);
    const markAuthorizationValid = useManagedSiteStore((state) => state.markAuthorizationValid);
    const setConnection = useManagedSiteStore((state) => state.setConnection);
    const requestRef = useRef<Promise<void> | null>(null);
    const queuedReasonRef = useRef<ManagedBalanceRefreshReason | null>(null);
    const initialKeyRef = useRef("");
    const modelSyncKeyRef = useRef("");
    const generationTimerRef = useRef<number | undefined>(undefined);
    const lastFetchedAtRef = useRef(0);
    const channel = useMemo(() => config.channels.find((item) => item.id === authorization.channelId), [authorization.channelId, config.channels]);

    useEffect(() => {
        if (!managed || !authorization.granted || !authorization.valid || !channel?.baseUrl.trim() || !channel.apiKey.trim()) return;
        const syncKey = `${channel.id}:${channel.baseUrl}:${channel.apiKey}`;
        if (modelSyncKeyRef.current === syncKey) return;
        modelSyncKeyRef.current = syncKey;
        const requestedChannel = channel;
        setConnection("syncing", "正在同步当前 Key 的可用模型");
        message.loading({ key: "api-import", content: "正在同步当前 Key 的可用模型…", duration: 0 });
        void fetchChannelModels(requestedChannel)
            .then((names) => {
                const latestConfig = useConfigStore.getState().config;
                const currentChannel = latestConfig.channels.find((item) => item.id === requestedChannel.id);
                if (!currentChannel || currentChannel.baseUrl !== requestedChannel.baseUrl || currentChannel.apiKey !== requestedChannel.apiKey || currentChannel.apiFormat !== requestedChannel.apiFormat) return;
                const syncedChannel = syncChannelModelNames(currentChannel, names);
                const syncedChannels = latestConfig.channels.map((item) => (item.id === syncedChannel.id ? syncedChannel : item));
                useConfigStore.getState().setConfig(withModelChannels(latestConfig, syncedChannels));
                if (!syncedChannel.models.length) throw new Error("当前 Key 未返回可用模型");
                const hasImage = syncedChannel.models.some((model) => model.capability === "image");
                const hasVideo = syncedChannel.models.some((model) => model.capability === "video");
                const statusMessage = !hasImage && !hasVideo ? "已连接，当前 Key 仅提供画布模型" : !hasImage ? "已连接，当前 Key 无生图模型" : !hasVideo ? "已连接，当前 Key 无视频模型" : "已连接";
                setConnection("connected", statusMessage);
                message.success({ key: "api-import", content: `已同步 ${syncedChannel.models.length} 个可用模型` });
            })
            .catch((error) => {
                const kind = classifyManagedFailure({ message: error instanceof Error ? error.message : "" });
                if (shouldInvalidateManagedAuthorization("model_sync", kind)) markAuthorizationValid(false);
                const friendlyMessage = kind === "unauthorized" ? managedFailureMessage(kind) : "模型同步失败，请从阿柴 AI 控制台重新进入";
                setConnection(kind === "unauthorized" ? "unauthorized" : "error", friendlyMessage);
                message.error({ key: "api-import", content: friendlyMessage, duration: 6 });
            });
    }, [authorization.granted, authorization.valid, channel, managed, markAuthorizationValid, message, setConnection]);

    const refreshBalance = useCallback(
        (reason: ManagedBalanceRefreshReason) => {
            if (!managed || !authorization.granted || !channel?.baseUrl.trim() || !channel.apiKey.trim()) return Promise.resolve();
            const now = Date.now();
            if (reason === "focus" && now - lastFetchedAtRef.current < FOCUS_REFRESH_INTERVAL) return Promise.resolve();
            if (requestRef.current) {
                if (reason === "manual" || reason === "generation") queuedReasonRef.current = reason;
                return requestRef.current;
            }
            setBalance({ status: "loading", value: useManagedSiteStore.getState().balance.value, lastFetchedAt: useManagedSiteStore.getState().balance.lastFetchedAt });
            const request = fetchManagedBalance(channel, profile)
                .then((result) => {
                    const fetchedAt = Date.now();
                    lastFetchedAtRef.current = fetchedAt;
                    updateProfile(result.profile);
                    setBalance({ status: "ready", value: result.balance, lastFetchedAt: fetchedAt });
                })
                .catch((error) => {
                    const kind = error instanceof ManagedSiteRequestError ? error.kind : "unavailable";
                    const fetchedAt = Date.now();
                    lastFetchedAtRef.current = fetchedAt;
                    setBalance({ status: "unavailable", errorKind: kind, lastFetchedAt: fetchedAt });
                })
                .finally(() => {
                    requestRef.current = null;
                    const queuedReason = queuedReasonRef.current;
                    queuedReasonRef.current = null;
                    if (queuedReason) window.setTimeout(() => void refreshBalance(queuedReason), 0);
                });
            requestRef.current = request;
            return request;
        },
        [authorization.granted, channel, managed, profile, setBalance, updateProfile],
    );

    useEffect(() => {
        const initialKey = managed && authorization.granted && channel ? `${channel.id}:${channel.baseUrl}:${channel.apiKey}` : "";
        if (!initialKey || initialKeyRef.current === initialKey) return;
        initialKeyRef.current = initialKey;
        void refreshBalance("initial");
    }, [authorization.granted, channel, managed, refreshBalance]);

    useEffect(() => {
        if (!managed) return;
        const onFocus = () => void refreshBalance("focus");
        const onRefresh = (event: Event) => {
            const detail = (event as CustomEvent<{ reason?: ManagedBalanceRefreshReason; success?: boolean; message?: string }>).detail;
            const reason = detail?.reason || "manual";
            if (reason !== "generation") {
                void refreshBalance(reason);
                return;
            }
            if (detail?.success === false) {
                const kind = classifyManagedFailure({ message: detail.message });
                if (shouldInvalidateManagedAuthorization("generation", kind)) {
                    markAuthorizationValid(false);
                    setConnection("unauthorized", managedFailureMessage(kind));
                }
            }
            window.clearTimeout(generationTimerRef.current);
            generationTimerRef.current = window.setTimeout(() => void refreshBalance("generation"), GENERATION_REFRESH_DELAY);
        };
        window.addEventListener("focus", onFocus);
        window.addEventListener(MANAGED_BALANCE_REFRESH_EVENT, onRefresh);
        return () => {
            window.removeEventListener("focus", onFocus);
            window.removeEventListener(MANAGED_BALANCE_REFRESH_EVENT, onRefresh);
            window.clearTimeout(generationTimerRef.current);
        };
    }, [managed, markAuthorizationValid, refreshBalance, setConnection]);

    return null;
}
