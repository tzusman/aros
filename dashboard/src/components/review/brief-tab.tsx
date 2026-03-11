import { ScrollArea } from "@/components/ui/scroll-area";

export function BriefTab({ brief }: { brief: string }) {
  return (
    <ScrollArea className="flex-1">
      <div className="p-3 text-xs text-text-secondary leading-relaxed whitespace-pre-wrap">
        {brief}
      </div>
    </ScrollArea>
  );
}
