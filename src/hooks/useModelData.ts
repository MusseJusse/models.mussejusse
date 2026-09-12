import { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_SORT_DIRECTIONS, EMPTY_INDEX, filterModels,
  getAvailableFrontierProviders, loadModelIndex,
  type Capability, type ModelIndex, type ReleaseFilter, type SortDirection, type SortKey, type Weights,
} from "../lib/models";

export type ExplorerState = ReturnType<typeof useModelData>;

export function useModelData() {
  const [index, setIndex] = useState<ModelIndex>(EMPTY_INDEX);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(new Set());
  const [capability, setCapability] = useState<Capability>("all");
  const [weights, setWeights] = useState<Weights>("all");
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
        setError("The model catalog could not be loaded. Check your connection and try again.");
        setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const result = useMemo(() => filterModels(index, {
    query: deferredQuery, selectedProviders, capability, weights, releaseFilter, sort, sortDirection,
  }), [capability, deferredQuery, index, releaseFilter, selectedProviders, sort, sortDirection, weights]);

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
    totalModels: index.rows.length,
    query,
    selectedProviders,
    capability,
    weights,
    releaseFilter,
    sort,
    sortDirection,
    setQuery,
    toggleProvider: (value: string) =>
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
