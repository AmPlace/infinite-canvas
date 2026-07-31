import type { ReactNode } from "react";
import { Drawer } from "antd";
import { ArrowUpRight, CreditCard, Settings2 } from "lucide-react";
import { Link } from "react-router-dom";

import { UserStatusActions } from "@/components/layout/user-status-actions";
import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useConfigStore } from "@/stores/use-config-store";
import { useManagedSiteMode, useManagedSiteStore } from "@/stores/use-managed-site-store";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    tools?: readonly (typeof navigationTools)[number][];
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, tools = navigationTools, onClose }: MobileNavDrawerProps) {
    const managed = useManagedSiteMode();
    const profile = useManagedSiteStore((state) => state.profile);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    return (
        <Drawer title={managed ? `${profile.siteName} · AI 创作` : "导航"} placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="space-y-1">
                {tools.map((tool) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    return (
                        <Link
                            key={tool.slug}
                            to={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                active ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                            )}
                        >
                            <Icon className="size-5" />
                            <span>{tool.label}</span>
                        </Link>
                    );
                })}
                {managed ? (
                    <div className="mt-4 space-y-1 border-t border-stone-200 pt-4 dark:border-stone-800">
                        <button
                            type="button"
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-base text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                            onClick={() => {
                                openConfigDialog(false, "preferences");
                                onClose();
                            }}
                        >
                            <Settings2 className="size-5" />
                            <span>创作偏好</span>
                        </button>
                        {profile.rechargeUrl ? <ManagedMobileLink href={profile.rechargeUrl} icon={<CreditCard className="size-5" />} label="充值" /> : null}
                        {profile.consoleUrl ? <ManagedMobileLink href={profile.consoleUrl} icon={<ArrowUpRight className="size-5" />} label="返回控制台" /> : null}
                        <div className="px-2 pt-2">
                            <UserStatusActions showConfig={false} />
                        </div>
                    </div>
                ) : null}
            </div>
        </Drawer>
    );
}

function ManagedMobileLink({ href, icon, label }: { href: string; icon: ReactNode; label: string }) {
    return (
        <a href={href} className="flex items-center gap-3 rounded-lg px-3 py-3 text-base text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100">
            {icon}
            <span>{label}</span>
        </a>
    );
}
