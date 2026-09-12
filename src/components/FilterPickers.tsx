import { CaretDownIcon, CheckIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { useDismissibleDetails } from "../hooks/useDismissibleDetails";
import type { ExplorerState } from "../hooks/useModelData";
import { currentYear, getAvailableFrontierProviders, isExactProviderSelection, type ReleaseFilter } from "../lib/models";

function positionReleaseMenu(picker: HTMLDetailsElement) {
  const rect = picker.getBoundingClientRect();
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const width = Math.min(Math.max(rect.width, 142), viewportWidth - 16);
  const left = Math.max(
    viewportLeft + 8,
    Math.min(rect.left, viewportLeft + viewportWidth - width - 8),
  );
  const menu = picker.querySelector<HTMLElement>(".release-menu");
  const menuContentHeight = menu?.scrollHeight ?? 0;
  const menuHeight = menuContentHeight > 0 ? menuContentHeight + 2 : 194;
  const spaceBelow = Math.max(32, viewportTop + viewportHeight - rect.bottom - 8);
  const spaceAbove = Math.max(32, rect.top - viewportTop - 8);
  const openAbove = spaceBelow < menuHeight && spaceAbove > spaceBelow;
  const maxHeight = Math.min(menuHeight, openAbove ? spaceAbove : spaceBelow);
  const top = openAbove
    ? Math.max(viewportTop + 8, rect.top - maxHeight + 1)
    : rect.bottom - 1;

  picker.style.setProperty("--release-menu-left", `${left}px`);
  picker.style.setProperty("--release-menu-top", `${top}px`);
  picker.style.setProperty("--release-menu-width", `${width}px`);
  picker.style.setProperty("--release-menu-max-height", `${maxHeight}px`);
}

export function ReleasePicker({ state }: { state: ExplorerState }) {
  const pickerRef = useDismissibleDetails();
  const [isOpen, setIsOpen] = useState(false);
  const options: { value: ReleaseFilter; label: string }[] = [
    { value: "all", label: "Any date" },
    { value: "thisYear", label: String(currentYear) },
    { value: "lastYear", label: String(currentYear - 1) },
    { value: "last90", label: "Last 90 days" },
    { value: "last180", label: "Last 180 days" },
    { value: "undated", label: "No date" },
  ];
  const selectedLabel = options.find((option) => option.value === state.releaseFilter)?.label ?? "Any date";

  useEffect(() => {
    if (!isOpen) return;
    const picker = pickerRef.current;
    if (!picker) return;
    const filterBar = picker.closest(".filter-bar");
    const updatePosition = () => positionReleaseMenu(picker);
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);
    filterBar?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      filterBar?.removeEventListener("scroll", updatePosition);
    };
  }, [isOpen, pickerRef]);

  const focusMenuItem = (target: "selected" | "first" | "last") => {
    const picker = pickerRef.current;
    if (!picker) return;
    picker.open = true;
    requestAnimationFrame(() => {
      const buttons = picker.querySelectorAll<HTMLButtonElement>(".release-menu button");
      const button =
        target === "selected"
          ? picker.querySelector<HTMLButtonElement>(".release-menu button.active")
          : buttons[target === "first" ? 0 : buttons.length - 1];
      buttons.forEach((candidate) => {
        candidate.tabIndex = candidate === button ? 0 : -1;
      });
      button?.focus();
    });
  };

  const navigateMenu = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const { key, currentTarget } = event;
    const buttons = Array.from(
      pickerRef.current?.querySelectorAll<HTMLButtonElement>(".release-menu button") ?? [],
    );
    const currentIndex = buttons.indexOf(currentTarget);
    let nextIndex: number | undefined;

    if (key === "ArrowDown") nextIndex = (currentIndex + 1) % buttons.length;
    else if (key === "ArrowUp") nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    else if (key === "Home") nextIndex = 0;
    else if (key === "End") nextIndex = buttons.length - 1;
    else if (key.length === 1 && key !== " ") {
      const query = key.toLowerCase();
      nextIndex = buttons.findIndex((candidate, index) =>
        index !== currentIndex && candidate.textContent?.trim().toLowerCase().startsWith(query),
      );
      if (nextIndex < 0) nextIndex = undefined;
    }

    if (nextIndex === undefined) return;
    event.preventDefault();
    const nextButton = buttons[nextIndex];
    if (!nextButton) return;
    buttons.forEach((candidate) => {
      candidate.tabIndex = candidate === nextButton ? 0 : -1;
    });
    nextButton.focus();
  };

  return (
    <details
      ref={pickerRef}
      className="release-picker"
      onToggle={(event) => {
        setIsOpen(event.currentTarget.open);
        if (event.currentTarget.open) positionReleaseMenu(event.currentTarget);
      }}
    >
      <summary
        className={state.releaseFilter !== "all" ? "active" : ""}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (pickerRef.current) positionReleaseMenu(pickerRef.current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (pickerRef.current?.open) pickerRef.current.open = false;
            else focusMenuItem("selected");
            return;
          }
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          focusMenuItem(event.key === "ArrowDown" ? "first" : "last");
        }}
      >
        <span className="release-label">Released</span>
        <span>{selectedLabel}</span>
        <CaretDownIcon aria-hidden="true" />
      </summary>
      <div className="release-menu" role="menu" aria-label="Release date">
        {options.map((option) => {
          const selected = option.value === state.releaseFilter;
          return (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              className={selected ? "active" : ""}
              onKeyDown={navigateMenu}
              onClick={() => {
                state.setReleaseFilter(option.value);
                const picker = pickerRef.current;
                if (!picker) return;
                picker.open = false;
                picker.querySelector<HTMLElement>("summary")?.focus();
              }}
            >
              <span>{option.label}</span>
              {selected ? <CheckIcon weight="bold" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

export function ProviderPicker({ state }: { state: ExplorerState }) {
  const pickerRef = useDismissibleDetails();
  const [providerQuery, setProviderQuery] = useState("");

  const filteredProviders = useMemo(() => {
    const term = providerQuery.trim().toLowerCase();
    if (!term) return state.providers;
    return state.providers.filter((provider) => provider.toLowerCase().includes(term));
  }, [providerQuery, state.providers]);
  const allSelected =
    state.providers.length > 0 && state.selectedProviders.size === state.providers.length;
  const availableFrontierProviders = getAvailableFrontierProviders(state.providers);
  const frontierSelected =
    availableFrontierProviders.length > 0 &&
    isExactProviderSelection(state.selectedProviders, availableFrontierProviders);
  const pickerLabel = allSelected
    ? `All ${state.providers.length || ""} providers`
    : frontierSelected
      ? "Frontier labs"
      : `${state.selectedProviders.size} providers`;

  return (
    <details ref={pickerRef} className="provider-picker">
      <summary className={allSelected || frontierSelected ? "active" : ""}>
        {pickerLabel}
        <CaretDownIcon aria-hidden="true" />
      </summary>
      <div className="provider-menu">
        <div className="provider-search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input value={providerQuery} onChange={(event) => setProviderQuery(event.target.value)} placeholder="Search providers" />
        </div>
        <div className="provider-menu-actions">
          <button type="button" onClick={state.selectAllProviders}>Select all</button>
          <button
            type="button"
            className={frontierSelected ? "active" : ""}
            aria-pressed={frontierSelected}
            onClick={state.selectFrontierProviders}
            title={availableFrontierProviders.join(", ")}
          >
            Frontier labs
          </button>
          <button type="button" onClick={state.clearProviders}>Select none</button>
        </div>
        <div className="provider-options">
          {filteredProviders.map((provider) => (
            <label key={provider}>
              <input type="checkbox" checked={state.selectedProviders.has(provider)} onChange={() => state.toggleProvider(provider)} />
              <span className="checkbox"><CheckIcon weight="bold" aria-hidden="true" /></span>
              <span>{provider}</span>
            </label>
          ))}
          {filteredProviders.length === 0 ? <p>No matching providers</p> : null}
        </div>
      </div>
    </details>
  );
}
