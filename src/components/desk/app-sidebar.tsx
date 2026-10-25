"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity, Brain, Building2, CalendarDays, HardHat, History, House, Settings, Users,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const DESK = [
  { href: "/", label: "Home", icon: House },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/rotas", label: "Rotas", icon: CalendarDays },
  { href: "/buildings", label: "Buildings", icon: Building2 },
  { href: "/team", label: "Team", icon: Users },
  { href: "/contractors", label: "Contractors", icon: HardHat },
  { href: "/settings", label: "Settings", icon: Settings },
];

const RECORDS = [
  { href: "/corrections", label: "Corrections", icon: History },
  { href: "/activity", label: "Activity", icon: Activity },
];

function NavGroup({ items, label }: { items: typeof DESK; label?: string }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  className="h-10 rounded-full px-4 font-medium text-si-text/80 data-[active=true]:font-medium data-[active=true]:text-si-text data-[active=true]:shadow-[0_1px_2px_rgba(14,37,56,0.06)] hover:bg-white/70"
                >
                  <Link href={item.href} onClick={() => setOpenMobile(false)}>
                    <item.icon className="size-[18px]" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="px-4 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-si-neutral font-medium text-white">DB</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-semibold">Datte Bayo</div>
            <div className="truncate text-xs text-muted-foreground">Estate manager, Spring Court</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="px-1">
        <NavGroup items={DESK} />
        <NavGroup items={RECORDS} label="Records" />
      </SidebarContent>
    </Sidebar>
  );
}
