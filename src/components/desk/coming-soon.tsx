import { Clock } from "lucide-react";
import { DeskCard, PageTitle } from "./card";

export function ComingSoon({ title, about }: { title: string; about: string }) {
  return (
    <div className="flex flex-col gap-4">
      <PageTitle title={title} />
      <DeskCard className="py-12 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-si-tint text-si-neutral">
          <Clock className="size-5" />
        </span>
        <span className="mt-4 inline-block rounded-full bg-si-marker px-3 py-1 text-xs font-medium">Coming soon</span>
        <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">{about}</p>
      </DeskCard>
    </div>
  );
}
