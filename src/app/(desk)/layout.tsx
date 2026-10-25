import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/desk/app-sidebar";

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider style={{ "--sidebar-width": "15rem" } as React.CSSProperties}>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 bg-background/90 px-4 backdrop-blur md:hidden">
          <SidebarTrigger className="size-9 rounded-full bg-white" aria-label="Open menu" />
          <span className="font-semibold">Spring It</span>
        </header>
        <div className="mx-auto w-full max-w-[620px] px-4 pt-4 pb-16 md:pt-10">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
