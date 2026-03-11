import { useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { QueueItem } from "./queue-item";
import { useApp } from "@/context/app-context";
import { cn } from "@/lib/utils";

type Filter = "pending" | "all" | "revisions";

interface QueueSidebarProps {
  isOpen: boolean;
  onClose?: () => void;
}

export function QueueSidebar({ isOpen, onClose }: QueueSidebarProps) {
  const { state, selectDeliverable } = useApp();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

  const filtered = state.queue
    .filter((d) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !d.title.toLowerCase().includes(q) &&
          !d.source_agent.toLowerCase().includes(q)
        )
          return false;
      }
      if (filter === "pending") return d.stage === "human";
      if (filter === "revisions")
        return d.stage === "human" && d.revision_number > 1;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.entered_stage_at).getTime() -
        new Date(b.entered_stage_at).getTime()
    );

  if (!isOpen) return null;

  const filters: { key: Filter; label: string }[] = [
    { key: "pending", label: "Pending" },
    { key: "all", label: "All" },
    { key: "revisions", label: "Revisions" },
  ];

  function renderContent(onItemClick?: () => void) {
    return (
      <>
        <div className="p-3 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-text-primary">
              Review Queue
            </span>
            <span className="bg-active text-background text-[10px] font-semibold px-1.5 rounded-full">
              {filtered.length}
            </span>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search deliverables..."
              className="h-7 pl-7 text-xs bg-surface border-none"
            />
          </div>
        </div>

        <div className="flex gap-1 px-2 py-1.5 border-b border-border">
          {filters.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "text-[10px] px-2 py-0.5 rounded transition-colors cursor-pointer",
                filter === key
                  ? "bg-surface text-active border border-active/30"
                  : "text-text-muted hover:text-text-secondary"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-1">
            {filtered.map((item) => (
              <QueueItem
                key={item.id}
                item={item}
                isSelected={item.id === state.selectedId}
                onClick={() => {
                  selectDeliverable(item.id);
                  onItemClick?.();
                }}
              />
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-text-muted text-center py-8">
                No deliverables
              </p>
            )}
          </div>
        </ScrollArea>
      </>
    );
  }

  return (
    <>
      {/* Mobile: full-screen overlay */}
      <aside className="md:hidden fixed inset-0 z-40 bg-background flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-sm font-semibold text-text-primary">
            Review Queue
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface cursor-pointer"
            aria-label="Close queue"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>
        {renderContent(onClose)}
      </aside>

      {/* Desktop: sidebar panel */}
      <aside className="hidden md:flex w-queue flex-col border-r border-border bg-background shrink-0">
        {renderContent()}
      </aside>
    </>
  );
}
