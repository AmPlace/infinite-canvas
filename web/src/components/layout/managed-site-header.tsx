import { Button, Tooltip } from "antd";
import { Bot, CircleDollarSign, KeyRound, Menu, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { managedNavigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { useClearManagedAuthorization } from "@/hooks/use-clear-managed-authorization";
import { requestManagedBalanceRefresh } from "@/lib/managed-site";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/stores/use-config-store";
import { useAgentStore } from "@/stores/use-agent-store";
import { useManagedSiteStore } from "@/stores/use-managed-site-store";
import { UserStatusActions } from "@/components/layout/user-status-actions";

export function ManagedSiteHeader({ activeToolSlug, onOpenMobileNav }: { activeToolSlug?: NavigationToolSlug; onOpenMobileNav: () => void }) {
    const config = useConfigStore((state) => state.config);
    const agentPanelOpen = useAgentStore((state) => state.panelOpen);
    const toggleAgentPanel = useAgentStore((state) => state.togglePanel);
    const profile = useManagedSiteStore((state) => state.profile);
    const authorization = useManagedSiteStore((state) => state.authorization);
    const connectionStatus = useManagedSiteStore((state) => state.connectionStatus);
    const connectionMessage = useManagedSiteStore((state) => state.connectionMessage);
    const balance = useManagedSiteStore((state) => state.balance);
    const clearAuthorization = useClearManagedAuthorization();
    const channel = config.channels.find((item) => item.id === authorization.channelId);
    const hasImage = Boolean(channel?.models.some((model) => model.capability === "image"));
    const hasVideo = Boolean(channel?.models.some((model) => model.capability === "video"));
    const hasCreativeModel = Boolean(channel?.models.length);
    const connection = managedConnectionDisplay(connectionStatus, connectionMessage, authorization.granted, authorization.valid, hasImage, hasVideo, hasCreativeModel);
    const balanceText = balance.value ? balance.value.displayText : balance.status === "loading" ? "正在刷新" : "余额暂不可用";
    const lowBalance = Boolean(balance.value?.low);
    const ready = Boolean(authorization.granted && authorization.valid && connectionStatus === "connected" && channel?.baseUrl.trim() && channel.apiKey.trim() && hasCreativeModel);
    const homePath = hasImage ? "/image" : hasVideo ? "/video" : "/canvas";

    if (!ready) {
        return (
            <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-stone-200/80 bg-background/95 backdrop-blur-xl dark:border-stone-800/80">
                <div className="mx-auto flex h-full max-w-[1480px] items-center gap-2.5 px-4 sm:px-5">
                    <img src={profile.logoUrl || "/logo.svg"} alt="" className="size-7 rounded-lg object-contain" />
                    <span className="truncate text-[15px] font-semibold tracking-tight text-stone-950 dark:text-stone-100">{profile.siteName}</span>
                    <span className="text-stone-300 dark:text-stone-700">·</span>
                    <span className="text-sm font-medium text-stone-600 dark:text-stone-300">AI 创作</span>
                </div>
            </header>
        );
    }

    return (
        <header className="sticky top-0 z-30 h-14 shrink-0 border-b border-stone-200/80 bg-background/95 backdrop-blur-xl dark:border-stone-800/80">
            <div className="mx-auto flex h-full max-w-[1480px] items-center justify-between gap-3 px-3 sm:px-5">
                <div className="flex min-w-0 items-center">
                    <Link to={homePath} className="flex min-w-0 shrink-0 items-center gap-2.5">
                        <img src={profile.logoUrl || "/logo.svg"} alt="" className="size-7 rounded-lg object-contain" />
                        <span className="hidden truncate text-[15px] font-semibold tracking-tight text-stone-950 sm:block dark:text-stone-100">{profile.siteName}</span>
                        <span className="hidden text-stone-300 sm:block dark:text-stone-700">·</span>
                        <span className="hidden truncate text-sm font-medium text-stone-600 sm:block dark:text-stone-300">AI 创作</span>
                    </Link>
                    <button type="button" className="ml-2 inline-flex size-8 items-center justify-center text-stone-600 xl:hidden dark:text-stone-300" onClick={onOpenMobileNav} aria-label="打开创作导航">
                        <Menu className="size-5" />
                    </button>
                    <nav className="ml-8 hidden h-14 items-center gap-7 xl:flex">
                        {managedNavigationTools.map((tool) => {
                            const Icon = tool.icon;
                            const active = activeToolSlug === tool.slug;
                            return (
                                <Link
                                    key={tool.slug}
                                    to={`/${tool.slug}`}
                                    className={cn(
                                        "relative flex h-14 items-center gap-1.5 text-sm transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
                                        active ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100" : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
                                    )}
                                >
                                    <Icon className="size-4" />
                                    <span>{tool.label}</span>
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
                    <span className="hidden sm:inline-flex">
                        <Tooltip title={agentPanelOpen ? "收起 Agent" : "打开 Agent"}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Bot className="size-4" />} onClick={toggleAgentPanel} aria-label="打开 Agent" />
                        </Tooltip>
                    </span>
                    <Tooltip title={connection.detail}>
                        <div className={cn("hidden h-8 items-center gap-2 px-2 text-xs font-medium sm:flex", connection.tone)}>
                            <span className={cn("size-1.5 rounded-full", connection.dot)} />
                            <span>{connection.label}</span>
                        </div>
                    </Tooltip>
                    <div className={cn("flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium", lowBalance ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "text-stone-700 dark:text-stone-200")}>
                        <CircleDollarSign className="size-3.5" />
                        <span className="hidden text-stone-400 sm:inline">余额</span>
                        <span>{lowBalance ? `余额不足 · ${balanceText}` : balanceText}</span>
                        <Tooltip title="刷新余额">
                            <button type="button" className="ml-0.5 grid size-6 place-items-center rounded-md transition hover:bg-black/5 dark:hover:bg-white/10" onClick={() => requestManagedBalanceRefresh("manual")} aria-label="刷新余额">
                                <RefreshCw className={cn("size-3.5", balance.status === "loading" && "animate-spin")} />
                            </button>
                        </Tooltip>
                    </div>
                    {profile.rechargeUrl ? (
                        <Button size="small" type={lowBalance ? "primary" : "default"} href={profile.rechargeUrl} target="_blank" rel="noopener noreferrer" className="!h-8 !rounded-lg !px-2.5">
                            充值
                        </Button>
                    ) : null}
                    {profile.consoleUrl ? (
                        <span className="hidden sm:inline-flex">
                            <Button size="small" type="text" href={profile.consoleUrl} onClick={clearAuthorization} className="!h-8 !rounded-lg !px-2 lg:!px-2.5" icon={<KeyRound className="size-3.5" />} aria-label="切换 API Key">
                                <span className="hidden lg:inline">切换 Key</span>
                            </Button>
                        </span>
                    ) : null}
                    <span className="hidden sm:inline-flex">
                        <UserStatusActions />
                    </span>
                </div>
            </div>
        </header>
    );
}

function managedConnectionDisplay(status: ReturnType<typeof useManagedSiteStore.getState>["connectionStatus"], message: string, granted: boolean, valid: boolean, hasImage: boolean, hasVideo: boolean, hasCreativeModel: boolean) {
    if (status === "connecting") return { label: "正在连接", detail: message || "正在连接阿柴 AI", tone: "text-amber-600", dot: "bg-amber-500 animate-pulse" };
    if (status === "syncing") return { label: "正在同步", detail: message || "正在同步模型", tone: "text-amber-600", dot: "bg-amber-500 animate-pulse" };
    if (!granted) return { label: "待授权", detail: "请从阿柴 AI 控制台进入创作台", tone: "text-amber-600 dark:text-amber-400", dot: "bg-amber-500" };
    if (!valid || status === "unauthorized") return { label: "授权已失效", detail: message || "请从阿柴 AI 控制台重新进入", tone: "text-red-600 dark:text-red-400", dot: "bg-red-500" };
    if (status === "error") return { label: "连接异常", detail: message || "服务暂时不可用", tone: "text-red-600 dark:text-red-400", dot: "bg-red-500" };
    const availability = !hasCreativeModel ? "无创作模型" : !hasImage && !hasVideo ? "画布模型可用" : !hasImage ? "无生图模型" : !hasVideo ? "无视频模型" : "已连接";
    const complete = hasImage && hasVideo;
    return {
        label: availability,
        detail: message || (complete ? "图片与视频模型可用" : `当前授权${availability}`),
        tone: complete ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
        dot: complete ? "bg-emerald-500" : "bg-amber-500",
    };
}
