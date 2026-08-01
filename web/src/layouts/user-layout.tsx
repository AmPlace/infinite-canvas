import type { ReactNode } from "react";

import { AgentPanel } from "@/components/agent/agent-panel";
import { AppTopNav } from "@/components/layout/app-top-nav";
import { ManagedSiteGate } from "@/components/layout/managed-site-gate";
import { useManagedSiteMode, useManagedSiteStore } from "@/stores/use-managed-site-store";

export default function UserLayout({ children }: { children: ReactNode }) {
    const managed = useManagedSiteMode();
    const authorization = useManagedSiteStore((state) => state.authorization);
    const showAgent = !managed || (authorization.granted && authorization.valid);
    return (
        <div className="flex h-dvh overflow-hidden bg-background text-foreground">
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <AppTopNav />
                <div className="min-h-0 flex-1 overflow-hidden">
                    <ManagedSiteGate>{children}</ManagedSiteGate>
                </div>
            </div>
            {showAgent ? <AgentPanel /> : null}
        </div>
    );
}
