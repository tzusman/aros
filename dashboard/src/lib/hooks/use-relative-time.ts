import { useState, useEffect } from "react";

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function useRelativeTime(dateStr: string | null, intervalMs = 60_000) {
  const [display, setDisplay] = useState(() =>
    dateStr ? formatRelativeTime(dateStr) : ""
  );

  useEffect(() => {
    if (!dateStr) return;
    setDisplay(formatRelativeTime(dateStr));
    const id = setInterval(
      () => setDisplay(formatRelativeTime(dateStr)),
      intervalMs
    );
    return () => clearInterval(id);
  }, [dateStr, intervalMs]);

  return display;
}
