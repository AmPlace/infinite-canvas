import { Button } from "antd";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { useClearManagedAuthorization } from "@/hooks/use-clear-managed-authorization";
import { useManagedSiteMode, useManagedSiteStore } from "@/stores/use-managed-site-store";

export default function RouteErrorPage() {
    const managed = useManagedSiteMode();
    const profile = useManagedSiteStore((state) => state.profile);
    const clearAuthorization = useClearManagedAuthorization();
    return (
        <main className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
            <section className="w-full max-w-md text-center">
                <AlertTriangle className="mx-auto size-10 text-amber-500" />
                <h1 className="mt-5 text-2xl font-semibold">页面暂时无法加载</h1>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">本地配置可能刚刚更新，请重新加载页面后再试。</p>
                <div className="mt-7 flex justify-center gap-3">
                    <Button type="primary" icon={<RefreshCw className="size-4" />} onClick={() => window.location.reload()}>
                        重新加载
                    </Button>
                    {managed && profile.consoleUrl ? (
                        <Button href={profile.consoleUrl} onClick={clearAuthorization}>
                            重新授权
                        </Button>
                    ) : (
                        <Button href="/">返回首页</Button>
                    )}
                </div>
            </section>
        </main>
    );
}
