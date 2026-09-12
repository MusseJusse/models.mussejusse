import { MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { useModelData, type ExplorerState } from "../hooks/useModelData";
import { getAvailableFrontierProviders, isExactProviderSelection, sortLabel } from "../lib/models";
import { ProviderPicker, ReleasePicker } from "./FilterPickers";
import ModelTable from "./ModelTable";

export default function ModelExplorer() {
  const state = useModelData();

  return (
    <main className="catalog">
      <CatalogHeader state={state} />
      <FilterBar state={state} />
      <StatusBar state={state} />
      <ModelTable state={state} />
    </main>
  );
}

function CatalogHeader({ state }: { state: ExplorerState }) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (!slash && !commandK) return;
      const target = event.target;
      if (slash && target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  return (
    <header className="catalog-header">
      <div className="catalog-title">
        <strong>models.dev</strong>
        <span className="title-slash" aria-hidden="true" />
        <span>{state.isLoading ? "Loading model catalog" : `${state.totalModels.toLocaleString()} AI models`}</span>
      </div>

      <div className="header-actions">
        <label className="catalog-search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <span className="sr-only">Search models</span>
          <input
            ref={searchRef}
            type="search"
            value={state.query}
            onChange={(event) => state.setQuery(event.target.value)}
            placeholder="Search models"
          />
          {state.query ? (
            <button type="button" onClick={() => state.setQuery("")} aria-label="Clear search"><XIcon aria-hidden="true" /></button>
          ) : null}
        </label>
      </div>
    </header>
  );
}

function FilterBar({ state }: { state: ExplorerState }) {
  const defaultProviders = getAvailableFrontierProviders(state.providers);
  const hasFilters =
    !isExactProviderSelection(state.selectedProviders, defaultProviders) ||
    state.capability !== "all" ||
    state.weights !== "all" ||
    state.releaseFilter !== "all" ||
    state.query !== "";

  return (
    <section className="filter-bar" aria-label="Model filters">
      <span className="filter-label">Filters</span>
      <ProviderPicker state={state} />
      <span className="filter-separator capability-filter-separator" aria-hidden="true" />

      <div className="filter-group capability-filter" aria-label="Capability">
        {([
          ["all", "All"],
          ["reasoning", "Reasoning"],
          ["tools", "Tools"],
          ["vision", "Vision"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={state.capability === id ? "active" : ""}
            aria-pressed={state.capability === id}
            onClick={() => state.setCapability(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <span className="filter-separator" aria-hidden="true" />
      <div className="filter-group" aria-label="Model weights">
        {([
          ["all", "Any weights"],
          ["open", "Open"],
          ["closed", "Closed"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={state.weights === id ? "active" : ""}
            aria-pressed={state.weights === id}
            onClick={() => state.setWeights(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <ReleasePicker state={state} />

      {hasFilters ? <button className="reset-button" type="button" onClick={state.reset}>Reset</button> : null}
    </section>
  );
}

function StatusBar({ state }: { state: ExplorerState }) {
  return (
    <div className="status-bar" aria-live="polite">
      <span>{state.isLoading ? "Loading models" : `${state.filteredCount.toLocaleString()} selected models`}</span>
      <span>{state.selectedProviders.size} / {state.providers.length} providers</span>
      <span>Sort: {sortLabel(state.sort)}, {state.sortDirection}</span>
      {state.visible.length < state.filteredCount ? <span>Showing first {state.visible.length}</span> : null}
    </div>
  );
}
