import { Outlet } from "react-router-dom";
import { TopBar } from "./top-bar";
import { IconRail } from "./icon-rail";
import type { ConnectionStatus } from "@/lib/api/types";

interface LayoutProps {
  connectionStatus: ConnectionStatus;
  onRetry?: () => void;
}

export function Layout({ connectionStatus, onRetry }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <TopBar connectionStatus={connectionStatus} onRetry={onRetry} />
      <div className="flex flex-1 min-h-0">
        <IconRail />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
