import { useState, useCallback } from "react";

export function usePanelState(key: string, defaultOpen = true) {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(`aros-panel-${key}`);
    return stored !== null ? stored === "true" : defaultOpen;
  });

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(`aros-panel-${key}`, String(next));
      return next;
    });
  }, [key]);

  return { isOpen, toggle };
}
