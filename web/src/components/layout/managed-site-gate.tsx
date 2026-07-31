import type { ReactNode } from "react";
import { Button, Spin } from "antd";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";

import { isManagedCreativePath } from "@/lib/managed-site";
import { useConfigStore } from "@/stores/use-config-store";
import { useManagedSiteMode, useManagedSiteStore } from "@/stores/use-managed-site-store";

export function ManagedSiteGate({ children }: { children: ReactNode }) {
    const managed = useManagedSiteMode();
    const { pathname } = useLocation();
    const config = useConfigStore((state) => state.config);
    const profile = useManagedSiteStore((state) => state.profile);
    const authorization = useManagedSiteStore((state) => state.authorization);
    const connectionStatus = useManagedSiteStore((state) => state.connectionStatus);
    const connectionMessage = useManagedSiteStore((state) => state.connectionMessage);
    if (!managed) return <>{children}</>;

    const channel = config.channels.find((item) => item.id === authorization.channelId);
    const hasCreativeModel = Boolean(channel?.models.some((model) => model.capability === "image" || model.capability === "video"));
    const ready = Boolean(authorization.granted && authorization.valid && channel?.baseUrl.trim() && channel.apiKey.trim() && hasCreativeModel);
    if (ready && pathname === "/") return <Navigate to="/image" replace />;
    if (ready && !isManagedCreativePath(pathname)) return <Navigate to="/image" replace />;
    if (ready) return <>{children}</>;

    const pending = connectionStatus === "connecting" || connectionStatus === "syncing";
    const missingModels = Boolean(authorization.granted && authorization.valid && channel && !hasCreativeModel);
    const title = pending
        ? connectionStatus === "syncing"
            ? "正在同步创作模型"
            : `正在连接${profile.siteName}`
        : authorization.granted && !authorization.valid
          ? `登录或授权已失效，请从${profile.siteName}控制台重新进入`
          : missingModels
            ? "当前 Key 无生图或视频模型"
            : authorization.granted
              ? connectionMessage || "授权暂不可用"
              : `请从${profile.siteName}控制台进入创作台`;
    const description = pending ? "即将完成，请稍候…" : missingModels ? "请返回控制台检查当前账号或 Key 的模型权限。" : "为了保护账号与额度安全，创作台需要由控制台完成授权后进入。";
    return (
        <main className="grid h-full place-items-center overflow-y-auto bg-[radial-gradient(circle_at_top,#fff7ed_0,transparent_42%)] px-6 dark:bg-[radial-gradient(circle_at_top,rgba(120,53,15,.18)_0,transparent_42%)]">
            <section className="w-full max-w-md text-center">
                <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl border border-stone-200 bg-background shadow-sm dark:border-stone-800">{pending ? <Spin size="small" /> : <ShieldCheck className="size-6 text-amber-600" />}</div>
                <div className="mb-3 flex items-center justify-center gap-2">
                    <img src={profile.logoUrl || "/logo.svg"} alt="" className="size-7 rounded-lg object-contain" />
                    <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">{profile.siteName} · AI 创作</span>
                </div>
                <h1 className="text-balance text-2xl font-semibold tracking-tight text-stone-950 dark:text-stone-100">{title}</h1>
                <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-stone-500 dark:text-stone-400">{description}</p>
                {!pending && profile.consoleUrl ? (
                    <Button type="primary" size="large" href={profile.consoleUrl} className="mt-7 !rounded-xl !px-5" icon={<ArrowUpRight className="size-4" />}>
                        返回控制台
                    </Button>
                ) : null}
            </section>
        </main>
    );
}
