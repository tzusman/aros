import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BriefTab } from "./brief-tab";
import { ObjectiveTab } from "./objective-tab";
import { SubjectiveTab } from "./subjective-tab";
import { HistoryTab } from "./history-tab";
import type { Deliverable } from "@/lib/api/types";

interface ContextPanelProps {
  deliverable: Deliverable;
  isOpen: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function ContextPanel({
  deliverable,
  isOpen,
  activeTab,
  onTabChange,
}: ContextPanelProps) {
  if (!isOpen) return null;

  const tabsContent = (
    <Tabs value={activeTab} onValueChange={onTabChange} className="flex flex-col flex-1 min-h-0">
      <TabsList className="w-full rounded-none border-b border-border bg-transparent h-auto p-0 justify-start">
        {["brief", "objective", "subjective", "history"].map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            className="flex-1 text-[10px] py-2 rounded-none border-b-2 border-transparent data-[state=active]:border-active data-[state=active]:text-active data-[state=active]:bg-transparent text-text-muted capitalize"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="brief" className="flex-1 min-h-0 m-0">
        <BriefTab brief={deliverable.brief} />
      </TabsContent>
      <TabsContent value="objective" className="flex-1 min-h-0 m-0">
        <ObjectiveTab checks={deliverable.objective_results} />
      </TabsContent>
      <TabsContent value="subjective" className="flex-1 min-h-0 m-0">
        <SubjectiveTab
          criteria={deliverable.subjective_results}
          overallScore={deliverable.score}
        />
      </TabsContent>
      <TabsContent value="history" className="flex-1 min-h-0 m-0">
        <HistoryTab history={deliverable.history} />
      </TabsContent>
    </Tabs>
  );

  return (
    <>
      {/* Mobile: horizontal section above decision bar */}
      <aside className="md:hidden border-t border-border max-h-[40vh] overflow-y-auto">
        {tabsContent}
      </aside>

      {/* Desktop: right sidebar panel */}
      <aside className="hidden md:flex w-context flex-col border-l border-border shrink-0">
        {tabsContent}
      </aside>
    </>
  );
}
