import { ScrollArea } from "@/components/ui/scroll-area";
import { formatRelativeTime } from "@/lib/hooks/use-relative-time";
import type { RevisionEntry } from "@/lib/api/types";

export function HistoryTab({ history }: { history: RevisionEntry[] }) {
  if (history.length === 0) {
    return (
      <p className="p-3 text-xs text-text-muted">Original submission.</p>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="p-3 space-y-3">
        {history.map((entry) => (
          <div key={entry.version} className="border-b border-border pb-3 last:border-0">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] text-text-primary font-medium">
                v{entry.version}
              </span>
              <span className="text-[9px] text-text-muted">
                {formatRelativeTime(entry.timestamp)}
              </span>
            </div>
            <p className="text-[10px] text-text-secondary">{entry.summary}</p>
            {entry.feedback && (
              <div className="mt-1.5 bg-surface p-2 rounded text-[9px] text-text-muted">
                <span className="font-medium text-text-secondary">
                  Feedback:
                </span>{" "}
                {entry.feedback.summary}
              </div>
            )}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
