import { useEffect } from "react";

type KeyHandler = () => void;
type KeyMap = Record<string, KeyHandler>;

export function useKeyboard(keyMap: KeyMap) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const fn = keyMap[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [keyMap]);
}
