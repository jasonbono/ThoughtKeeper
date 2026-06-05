import { useEffect } from "react";

export function useOptionPeriod(
  onKeyDown: (e: KeyboardEvent) => void,
  onKeyUp: (e: KeyboardEvent) => void,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.code === "Period") {
        e.preventDefault();
        if (e.repeat) return;
        onKeyDown(e);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Period") {
        onKeyUp(e);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [onKeyDown, onKeyUp]);
}
