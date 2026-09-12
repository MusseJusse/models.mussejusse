import { useEffect, useRef } from "react";

export function useDismissibleDetails() {
  const pickerRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismissOutside = (event: Event) => {
      const picker = pickerRef.current;
      if (!picker?.open || !(event.target instanceof Node)) return;
      if (!picker.contains(event.target)) picker.open = false;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const picker = pickerRef.current;
      if (event.key !== "Escape" || !picker?.open) return;
      event.preventDefault();
      picker.open = false;
      picker.querySelector<HTMLElement>("summary")?.focus();
    };

    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", dismissOutside, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", dismissOutside, true);
    };
  }, []);

  return pickerRef;
}
