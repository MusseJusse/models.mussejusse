import {
  Brain,
  CaretDown,
  Check,
  Code,
  Copy,
  Database,
  Eye,
  MagnifyingGlass,
  Wrench,
  X,
} from "@phosphor-icons/react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

type ApiModel = {
  id: string;
  name: string;
  family?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  open_weights?: boolean;
  cost?: { input?: number; output?: number };
  limit?: { context?: number; output?: number };
  modalities?: { input?: string[]; output?: string[] };
  release_date?: string;
  last_updated?: string;
};

type ApiProvider = {
  id: string;
  name: string;
  models: Record<string, ApiModel>;
};

type Row = ApiModel & {
  providerId: string;
  providerName: string;
  searchText: string;
  updatedTime: number;
  inputCost: number;
  outputCost: number;
  contextLimit: number;
  capabilityMask: number;
  weightsMask: number;
  releaseTime: number;
  releaseYear: number;
};

type SortKey = "release" | "updated" | "context" | "inputCost" | "outputCost" | "providerName" | "name";
type SortDirection = "ascending" | "descending";
type ReleaseFilter = "all" | "thisYear" | "lastYear" | "last90" | "last180" | "undated";
type ModelIndex = {
  rows: Row[];
  providers: string[];
  stats: { providers: number; models: number; reasoning: number; open: number; tools: number };
  ascendingIds: Record<SortKey, Uint32Array>;
};

type ExplorerState = {
  isLoading: boolean;
  error: string;
  visible: Row[];
  filteredCount: number;
  providers: string[];
  stats: ModelIndex["stats"];
  query: string;
  deferredQuery: string;
  selectedProviders: Set<string>;
  capability: string;
  weights: string;
  releaseFilter: ReleaseFilter;
  sort: SortKey;
  sortDirection: SortDirection;
  setQuery: (value: string) => void;
  toggleProvider: (value: string) => void;
  selectAllProviders: () => void;
  selectFrontierProviders: () => void;
  clearProviders: () => void;
  setCapability: (value: string) => void;
  setWeights: (value: string) => void;
  setReleaseFilter: (value: ReleaseFilter) => void;
  selectSort: (value: SortKey) => void;
  reset: () => void;
};

const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const money = (value?: number) =>
  typeof value === "number" ? `$${value.toFixed(value < 1 ? 3 : 2)}` : "-";
const limit = (value?: number) =>
  typeof value === "number"
    ? value >= 1_000_000
      ? compactFormat.format(value)
      : numberFormat.format(value)
    : "-";
const EMPTY_STATS = { providers: 0, models: 0, reasoning: 0, open: 0, tools: 0 };
const EMPTY_INDEX: ModelIndex = {
  rows: [],
  providers: [],
  stats: EMPTY_STATS,
  ascendingIds: {
    release: new Uint32Array(),
    updated: new Uint32Array(),
    context: new Uint32Array(),
    inputCost: new Uint32Array(),
    outputCost: new Uint32Array(),
    providerName: new Uint32Array(),
    name: new Uint32Array(),
  },
};

const capabilityMasks = { all: 0, reasoning: 1, tools: 2, vision: 4 } as const;
const weightsMasks = { all: 0, open: 1, closed: 2 } as const;
const currentYear = new Date().getFullYear();
const nowTime = Date.now();
const dayMs = 24 * 60 * 60 * 1000;
const FRONTIER_PROVIDERS = ["OpenAI", "Google", "Anthropic", "Z.AI", "xAI"] as const;
const DEFAULT_SORT_DIRECTIONS: Record<SortKey, SortDirection> = {
  release: "descending",
  updated: "descending",
  context: "descending",
  inputCost: "ascending",
  outputCost: "ascending",
  providerName: "ascending",
  name: "ascending",
};
const getAvailableFrontierProviders = (providers: readonly string[]) =>
  FRONTIER_PROVIDERS.filter((provider) => providers.includes(provider));
const isExactProviderSelection = (selectedProviders: ReadonlySet<string>, providers: readonly string[]) =>
  selectedProviders.size === providers.length && providers.every((provider) => selectedProviders.has(provider));

let indexCache: ModelIndex | undefined;
let indexPromise: Promise<ModelIndex> | undefined;

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

function useModelData(): ExplorerState {
  const [index, setIndex] = useState<ModelIndex>(EMPTY_INDEX);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [capability, setCapability] = useState("all");
  const [weights, setWeights] = useState("all");
  const [releaseFilter, setReleaseFilter] = useState<ReleaseFilter>("all");
  const [sort, setSort] = useState<SortKey>("release");
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    DEFAULT_SORT_DIRECTIONS.release,
  );
  const [error, setError] = useState("");
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    let active = true;
    loadModelIndex()
      .then((modelIndex) => {
        if (!active) return;
        setIndex(modelIndex);
        setSelectedProviders(new Set(getAvailableFrontierProviders(modelIndex.providers)));
        setIsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError("The model catalogue could not be loaded. Check your connection and try again.");
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const result = useMemo(() => {
    const sourceIds = index.ascendingIds[sort];
    const terms = deferredQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const requiredCapability = capabilityMasks[capability as keyof typeof capabilityMasks] ?? 0;
    const requiredWeights = weightsMasks[weights as keyof typeof weightsMasks] ?? 0;
    const visible: Row[] = [];
    let filteredCount = 0;
    const isAscending = sortDirection === "ascending";

    for (let cursor = 0; cursor < sourceIds.length; cursor += 1) {
      const rowIndex = isAscending ? cursor : sourceIds.length - cursor - 1;
      const row = index.rows[sourceIds[rowIndex]];
      if (!selectedProviders.has(row.providerName)) continue;
      if (requiredCapability && (row.capabilityMask & requiredCapability) === 0) continue;
      if (requiredWeights && (row.weightsMask & requiredWeights) === 0) continue;
      if (!matchesReleaseFilter(row, releaseFilter)) continue;
      if (terms.length && !terms.every((term) => row.searchText.includes(term))) continue;
      filteredCount += 1;
      if (visible.length < 250) visible.push(row);
    }

    return { visible, filteredCount };
  }, [capability, deferredQuery, index, releaseFilter, selectedProviders, sort, sortDirection, weights]);

  const reset = () => {
    setQuery("");
    setSelectedProviders(new Set(getAvailableFrontierProviders(index.providers)));
    setCapability("all");
    setWeights("all");
    setReleaseFilter("all");
    setSort("release");
    setSortDirection(DEFAULT_SORT_DIRECTIONS.release);
  };

  const selectSort = (nextSort: SortKey) => {
    if (nextSort === sort) {
      setSortDirection((current) => current === "ascending" ? "descending" : "ascending");
      return;
    }
    setSort(nextSort);
    setSortDirection(DEFAULT_SORT_DIRECTIONS[nextSort]);
  };

  return {
    isLoading,
    error,
    visible: result.visible,
    filteredCount: result.filteredCount,
    providers: index.providers,
    stats: index.stats,
    query,
    deferredQuery,
    selectedProviders,
    capability,
    weights,
    releaseFilter,
    sort,
    sortDirection,
    setQuery,
    toggleProvider: (value) =>
      setSelectedProviders((current) => {
        const next = new Set(current);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      }),
    selectAllProviders: () => setSelectedProviders(new Set(index.providers)),
    selectFrontierProviders: () =>
      setSelectedProviders(new Set(getAvailableFrontierProviders(index.providers))),
    clearProviders: () => setSelectedProviders(new Set()),
    setCapability,
    setWeights,
    setReleaseFilter,
    selectSort,
    reset,
  };
}

function matchesReleaseFilter(row: Row, releaseFilter: ReleaseFilter) {
  if (releaseFilter === "all") return true;
  if (releaseFilter === "undated") return row.releaseTime === 0;
  if (row.releaseTime === 0) return false;
  if (releaseFilter === "thisYear") return row.releaseYear === currentYear;
  if (releaseFilter === "lastYear") return row.releaseYear === currentYear - 1;
  if (releaseFilter === "last90") return nowTime - row.releaseTime <= 90 * dayMs;
  if (releaseFilter === "last180") return nowTime - row.releaseTime <= 180 * dayMs;
  return true;
}

function loadModelIndex() {
  if (indexCache) return Promise.resolve(indexCache);
  indexPromise ??= fetch("https://models.dev/api.json", { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("Model catalogue request failed");
      return response.json();
    })
    .then((data: Record<string, ApiProvider>) => {
      indexCache = buildModelIndex(data);
      return indexCache;
    });
  return indexPromise;
}

function buildModelIndex(data: Record<string, ApiProvider>): ModelIndex {
  const rows: Row[] = [];
  const providerSet = new Set<string>();
  let reasoning = 0;
  let open = 0;
  let tools = 0;

  for (const providerData of Object.values(data)) {
    providerSet.add(providerData.name);
    for (const model of Object.values(providerData.models ?? {})) {
      const modalities = `${model.modalities?.input?.join(" ") ?? ""} ${model.modalities?.output?.join(" ") ?? ""}`;
      const capabilityMask =
        (model.reasoning ? 1 : 0) |
        (model.tool_call ? 2 : 0) |
        (model.modalities?.input?.some((item) => item !== "text") ? 4 : 0);
      const weightsMask = model.open_weights ? 1 : 2;
      const releaseTime = Date.parse(model.release_date ?? "") || 0;
      if (model.reasoning) reasoning += 1;
      if (model.open_weights) open += 1;
      if (model.tool_call) tools += 1;
      rows.push({
        ...model,
        providerId: providerData.id,
        providerName: providerData.name,
        capabilityMask,
        weightsMask,
        releaseTime,
        releaseYear: releaseTime ? new Date(releaseTime).getFullYear() : 0,
        searchText: `${providerData.name} ${providerData.id} ${model.name} ${model.id} ${model.family ?? ""} ${modalities}`.toLowerCase(),
        updatedTime: Date.parse(model.last_updated ?? "1970-01-01") || 0,
        inputCost: model.cost?.input ?? Number.POSITIVE_INFINITY,
        outputCost: model.cost?.output ?? Number.POSITIVE_INFINITY,
        contextLimit: model.limit?.context ?? 0,
      });
    }
  }

  const ids = rows.map((_, id) => id);
  const toTypedIds = (sorted: number[]) => Uint32Array.from(sorted);
  return {
    rows,
    providers: [...providerSet].sort((a, b) => a.localeCompare(b)),
    stats: { providers: providerSet.size, models: rows.length, reasoning, open, tools },
    ascendingIds: {
      release: toTypedIds([...ids].sort((a, b) => rows[a].releaseTime - rows[b].releaseTime)),
      updated: toTypedIds([...ids].sort((a, b) => rows[a].updatedTime - rows[b].updatedTime)),
      context: toTypedIds([...ids].sort((a, b) => rows[a].contextLimit - rows[b].contextLimit)),
      inputCost: toTypedIds([...ids].sort((a, b) => rows[a].inputCost - rows[b].inputCost)),
      outputCost: toTypedIds([...ids].sort((a, b) => rows[a].outputCost - rows[b].outputCost)),
      providerName: toTypedIds([...ids].sort((a, b) => {
        const provider = rows[a].providerName.localeCompare(rows[b].providerName);
        return provider || rows[a].name.localeCompare(rows[b].name);
      })),
      name: toTypedIds([...ids].sort((a, b) => rows[a].name.localeCompare(rows[b].name))),
    },
  };
}

function CatalogHeader({ state }: { state: ExplorerState }) {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const slash = event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey;
      const commandK = event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey);
      if (!slash && !commandK) return;
      const target = event.target as HTMLElement | null;
      if (slash && target?.matches("input, textarea, select, [contenteditable='true']")) return;
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
        <span>{state.isLoading ? "Loading model catalogue" : `${state.stats.models.toLocaleString()} AI models`}</span>
      </div>

      <div className="header-actions">
        <label className="catalog-search">
          <MagnifyingGlass aria-hidden="true" />
          <span className="sr-only">Search models</span>
          <input
            ref={searchRef}
            type="search"
            value={state.query}
            onChange={(event) => state.setQuery(event.target.value)}
            placeholder="Search models"
          />
          {state.query ? (
            <button type="button" onClick={() => state.setQuery("")} aria-label="Clear search"><X aria-hidden="true" /></button>
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
      <span className="filter-separator" aria-hidden="true" />

      <div className="filter-group" aria-label="Capability">
        {[
          ["all", "All"],
          ["reasoning", "Reasoning"],
          ["tools", "Tools"],
          ["vision", "Vision"],
        ].map(([id, label]) => (
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
        {[
          ["all", "Any weights"],
          ["open", "Open"],
          ["closed", "Closed"],
        ].map(([id, label]) => (
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

function useDismissibleDetails() {
  const pickerRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
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
    const handleFocusIn = (event: FocusEvent) => {
      const picker = pickerRef.current;
      if (!picker?.open || !(event.target instanceof Node)) return;
      if (!picker.contains(event.target)) picker.open = false;
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
    };
  }, []);

  return pickerRef;
}

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

function ReleasePicker({ state }: { state: ExplorerState }) {
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

  const navigateMenu = (
    button: HTMLButtonElement,
    key: string,
    hasModifier: boolean,
    preventDefault: () => void,
  ) => {
    if (hasModifier) return;
    const buttons = Array.from(
      pickerRef.current?.querySelectorAll<HTMLButtonElement>(".release-menu button") ?? [],
    );
    const currentIndex = buttons.indexOf(button);
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
    preventDefault();
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
        <CaretDown aria-hidden="true" />
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
              onKeyDown={(event) =>
                navigateMenu(
                  event.currentTarget,
                  event.key,
                  event.ctrlKey || event.metaKey || event.altKey,
                  () => event.preventDefault(),
                )
              }
              onClick={() => {
                state.setReleaseFilter(option.value);
                const picker = pickerRef.current;
                if (!picker) return;
                picker.open = false;
                picker.querySelector<HTMLElement>("summary")?.focus();
              }}
            >
              <span>{option.label}</span>
              {selected ? <Check weight="bold" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </details>
  );
}

function ProviderPicker({ state }: { state: ExplorerState }) {
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
        <CaretDown aria-hidden="true" />
      </summary>
      <div className="provider-menu">
        <div className="provider-search">
          <MagnifyingGlass aria-hidden="true" />
          <input value={providerQuery} onChange={(event) => setProviderQuery(event.target.value)} placeholder="Search providers" />
        </div>
        <div className="provider-menu-actions">
          <button type="button" onClick={state.selectAllProviders}>Select all</button>
          <button
            type="button"
            className={frontierSelected ? "active" : ""}
            aria-pressed={frontierSelected}
            onClick={state.selectFrontierProviders}
            title="OpenAI, Google, Anthropic, Z.AI, and xAI"
          >
            Frontier labs
          </button>
          <button type="button" onClick={state.clearProviders}>Select none</button>
        </div>
        <div className="provider-options">
          {filteredProviders.map((provider) => (
            <label key={provider}>
              <input type="checkbox" checked={state.selectedProviders.has(provider)} onChange={() => state.toggleProvider(provider)} />
              <span className="checkbox"><Check weight="bold" aria-hidden="true" /></span>
              <span>{provider}</span>
            </label>
          ))}
          {filteredProviders.length === 0 ? <p>No matching providers</p> : null}
        </div>
      </div>
    </details>
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

function ModelTable({ state }: { state: ExplorerState }) {
  const [copiedId, setCopiedId] = useState("");
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copyModelId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(""), 1200);
  };

  return (
    <section className="table-viewport" aria-label="AI models">
      <div className="table-grid header-row" role="row">
        <SortHeader label="Provider" sort="providerName" state={state} />
        <SortHeader label="Model" sort="name" state={state} />
        <div className="header-cell" role="columnheader">Model ID</div>
        <SortHeader label="Release" sort="release" state={state} />
        <SortHeader label="Context" description="tokens" sort="context" state={state} />
        <SortHeader label="Input" description="per 1M" sort="inputCost" state={state} />
        <SortHeader label="Output" description="per 1M" sort="outputCost" state={state} />
        <div className="header-cell" role="columnheader">Capabilities</div>
        <div className="header-cell" role="columnheader">Weights</div>
        <SortHeader label="Updated" sort="updated" state={state} />
      </div>

      {state.error ? (
        <TableState icon={<Database />} title="Catalogue unavailable" message={state.error} action="Try again" onAction={() => window.location.reload()} />
      ) : state.isLoading ? (
        <LoadingRows />
      ) : state.visible.length === 0 ? (
        <TableState icon={<MagnifyingGlass />} title="No matching models" message="Change or reset the active filters." action="Reset filters" onAction={state.reset} />
      ) : (
        <div className="table-body">
          {state.visible.map((row) => (
            <div className="table-grid model-row" role="row" key={`${row.providerId}:${row.id}`}>
              <div className="cell provider-cell" role="cell">
                <img src={`https://models.dev/logos/${row.providerId}.svg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                <span>{row.providerName}</span>
              </div>
              <div className="cell model-cell" role="cell">
                <strong>{row.name}</strong>
                {row.family ? <small>{row.family}</small> : null}
              </div>
              <div className="cell id-cell" role="cell">
                <code>{row.id}</code>
                <button type="button" onClick={() => copyModelId(row.id)} aria-label={`Copy ${row.id}`}>
                  {copiedId === row.id ? <Check weight="bold" aria-hidden="true" /> : <Copy aria-hidden="true" />}
                </button>
              </div>
              <div className="cell mono muted" role="cell">{row.release_date ?? "-"}</div>
              <div className="cell mono strong" role="cell">{limit(row.limit?.context)}</div>
              <div className="cell mono strong" role="cell">{money(row.cost?.input)}</div>
              <div className="cell mono strong" role="cell">{money(row.cost?.output)}</div>
              <div className="cell capability-cell" role="cell"><Capabilities row={row} /></div>
              <div className="cell mono" role="cell">{row.open_weights ? "Open" : "Closed"}</div>
              <div className="cell mono muted" role="cell">{row.last_updated ?? "-"}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function SortHeader({ label, description, sort, state }: { label: string; description?: string; sort: SortKey; state: ExplorerState }) {
  const active = state.sort === sort;
  return (
    <button
      className={`header-cell sortable ${active ? "active" : ""}`}
      type="button"
      role="columnheader"
      aria-sort={active ? state.sortDirection : "none"}
      onClick={() => state.selectSort(sort)}
    >
      <span>{label}{active ? state.sortDirection === "ascending" ? " ↑" : " ↓" : ""}</span>
      {description ? <small>{description}</small> : null}
    </button>
  );
}

function Capabilities({ row }: { row: Row }) {
  const items = [
    [row.reasoning, Brain, "Reasoning"],
    [row.tool_call, Wrench, "Tool calling"],
    [row.modalities?.input?.some((item) => item !== "text"), Eye, "Multimodal input"],
    [row.open_weights, Code, "Open weights"],
  ] as const;
  const active = items.filter(([enabled]) => enabled);
  if (!active.length) return <span className="no-capabilities">-</span>;
  return (
    <div className="capability-icons">
      {active.map(([, Icon, label]) => <span key={label} title={label}><Icon aria-label={label} /></span>)}
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="table-body loading-body" aria-label="Loading model data">
      {Array.from({ length: 18 }).map((_, row) => (
        <div className="table-grid model-row" key={row} aria-hidden="true">
          {Array.from({ length: 10 }).map((__, cell) => <div className="cell" key={cell}><span className={`loading-line size-${(row + cell) % 3}`} /></div>)}
        </div>
      ))}
    </div>
  );
}

function TableState({ icon, title, message, action, onAction }: { icon: React.ReactNode; title: string; message: string; action: string; onAction: () => void }) {
  return (
    <div className="table-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{message}</p>
      <button type="button" onClick={onAction}>{action}</button>
    </div>
  );
}

function sortLabel(sort: SortKey) {
  return {
    release: "release date",
    updated: "updated",
    context: "context limit",
    inputCost: "input cost",
    outputCost: "output cost",
    providerName: "provider",
    name: "model",
  }[sort];
}
