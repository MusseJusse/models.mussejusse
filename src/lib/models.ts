export type ApiModel = {
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

export type ApiProvider = {
  id: string;
  name: string;
  models: Record<string, ApiModel>;
};

export type Row = ApiModel & {
  providerId: string;
  providerName: string;
  searchText: string;
  updatedTime: number;
  inputCost: number;
  outputCost: number;
  contextLimit: number;
  multimodal: boolean;
  releaseTime: number;
  releaseYear: number;
};

export type SortKey = "release" | "updated" | "context" | "inputCost" | "outputCost" | "providerName" | "name";
export type SortDirection = "ascending" | "descending";
export type ReleaseFilter = "all" | "thisYear" | "lastYear" | "last90" | "last180" | "undated";
export type ModelIndex = {
  rows: Row[];
  providers: string[];
  ascendingIds: Record<SortKey, Uint32Array>;
};

export const EMPTY_INDEX: ModelIndex = {
  rows: [],
  providers: [],
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

export const currentYear = new Date().getFullYear();
const nowTime = Date.now();
const dayMs = 24 * 60 * 60 * 1000;
const FRONTIER_PROVIDERS = ["OpenAI", "Google", "Anthropic", "Z.AI", "xAI", "DeepSeek", "Moonshot AI", "Alibaba"] as const;
export const DEFAULT_SORT_DIRECTIONS: Record<SortKey, SortDirection> = {
  release: "descending",
  updated: "descending",
  context: "descending",
  inputCost: "ascending",
  outputCost: "ascending",
  providerName: "ascending",
  name: "ascending",
};
export const getAvailableFrontierProviders = (providers: readonly string[]) =>
  FRONTIER_PROVIDERS.filter((provider) => providers.includes(provider));
export const isExactProviderSelection = (selectedProviders: ReadonlySet<string>, providers: readonly string[]) =>
  selectedProviders.size === providers.length && providers.every((provider) => selectedProviders.has(provider));

let indexPromise: Promise<ModelIndex> | undefined;

export function loadModelIndex() {
  indexPromise ??= fetch("https://models.dev/api.json", { cache: "force-cache" })
    .then((response) => {
      if (!response.ok) throw new Error("Model catalog request failed");
      return response.json() as Promise<Record<string, ApiProvider>>;
    })
    .then(buildModelIndex);
  return indexPromise;
}

// Build sort orders once so typing and filter changes only scan the catalog.
export function buildModelIndex(data: Record<string, ApiProvider>): ModelIndex {
  const rows: Row[] = [];
  const providerSet = new Set<string>();

  for (const providerData of Object.values(data)) {
    providerSet.add(providerData.name);
    for (const model of Object.values(providerData.models ?? {})) {
      const modalities = `${model.modalities?.input?.join(" ") ?? ""} ${model.modalities?.output?.join(" ") ?? ""}`;
      const releaseTime = Date.parse(model.release_date ?? "") || 0;
      rows.push({
        ...model,
        providerId: providerData.id,
        providerName: providerData.name,
        multimodal: model.modalities?.input?.some((item) => item !== "text") ?? false,
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
  return {
    rows,
    providers: [...providerSet].sort((a, b) => a.localeCompare(b)),
    ascendingIds: {
      release: Uint32Array.from([...ids].sort((a, b) => rows[a].releaseTime - rows[b].releaseTime)),
      updated: Uint32Array.from([...ids].sort((a, b) => rows[a].updatedTime - rows[b].updatedTime)),
      context: Uint32Array.from([...ids].sort((a, b) => rows[a].contextLimit - rows[b].contextLimit)),
      inputCost: Uint32Array.from([...ids].sort((a, b) => rows[a].inputCost - rows[b].inputCost)),
      outputCost: Uint32Array.from([...ids].sort((a, b) => rows[a].outputCost - rows[b].outputCost)),
      providerName: Uint32Array.from([...ids].sort((a, b) => {
        const provider = rows[a].providerName.localeCompare(rows[b].providerName);
        return provider || rows[a].name.localeCompare(rows[b].name);
      })),
      name: Uint32Array.from([...ids].sort((a, b) => rows[a].name.localeCompare(rows[b].name))),
    },
  };
}

export type ModelFilters = {
  query: string;
  selectedProviders: ReadonlySet<string>;
  releaseFilter: ReleaseFilter;
  sort: SortKey;
  sortDirection: SortDirection;
};

export function filterModels(index: ModelIndex, filters: ModelFilters) {
  const ids = index.ascendingIds[filters.sort];
  const terms = filters.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visible: Row[] = [];
  let filteredCount = 0;

  for (let cursor = 0; cursor < ids.length; cursor += 1) {
    const position = filters.sortDirection === "ascending" ? cursor : ids.length - cursor - 1;
    const row = index.rows[ids[position]];
    if (!filters.selectedProviders.has(row.providerName)) continue;
    if (!matchesReleaseFilter(row, filters.releaseFilter)) continue;
    if (!terms.every((term) => row.searchText.includes(term))) continue;
    filteredCount += 1;
    if (visible.length < 250) visible.push(row);
  }

  return { visible, filteredCount };
}

export function matchesReleaseFilter(row: Row, releaseFilter: ReleaseFilter) {
  if (releaseFilter === "all") return true;
  if (releaseFilter === "undated") return row.releaseTime === 0;
  if (row.releaseTime === 0) return false;
  if (releaseFilter === "thisYear") return row.releaseYear === currentYear;
  if (releaseFilter === "lastYear") return row.releaseYear === currentYear - 1;
  if (releaseFilter === "last90") return nowTime - row.releaseTime <= 90 * dayMs;
  if (releaseFilter === "last180") return nowTime - row.releaseTime <= 180 * dayMs;
  return true;
}

export function sortLabel(sort: SortKey) {
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
