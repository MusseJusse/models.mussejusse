import assert from "node:assert/strict";
import test from "node:test";
import {
  buildModelIndex, currentYear, filterModels, getAvailableFrontierProviders,
  isExactProviderSelection, type ApiModel, type ModelFilters, type SortKey,
} from "./models";

const models: ApiModel[] = [
  { id: "alpha", name: "Alpha", family: "Family A", reasoning: true, tool_call: true,
    open_weights: true, modalities: { input: ["text", "image"] },
    release_date: `${currentYear}-01-01`, last_updated: "2025-02-01",
    cost: { input: 0, output: 2 }, limit: { context: 1000 } },
  { id: "beta", name: "Beta", modalities: { output: ["image"] },
    release_date: `${currentYear - 1}-01-01`, last_updated: "2025-01-01",
    cost: { input: 1, output: 1 }, limit: { context: 2000 } },
  { id: "unknown", name: "Unknown", release_date: "invalid" },
];
const index = buildModelIndex({ openai: {
  id: "openai", name: "OpenAI", models: Object.fromEntries(models.map(model => [model.id, model])),
} });
const defaults: ModelFilters = {
  query: "", selectedProviders: new Set(index.providers),
  releaseFilter: "all", sort: "name", sortDirection: "ascending",
};
const ids = (filters: Partial<ModelFilters> = {}) =>
  filterModels(index, { ...defaults, ...filters }).visible.map(row => row.id);

test("search combines case-insensitive terms across provider, family, and modalities", () => {
  assert.deepEqual(ids({ query: "  OPENAI image FAMILY  " }), ["alpha"]);
  assert.deepEqual(ids({ query: "image" }), ["alpha", "beta"]);
  assert.deepEqual(ids({ query: "missing" }), []);
});

test("provider and release filters compose", () => {
  assert.deepEqual(ids({ selectedProviders: new Set() }), []);
  assert.deepEqual(ids({ releaseFilter: "lastYear" }), ["beta"]);
  assert.deepEqual(ids({ releaseFilter: "undated" }), ["unknown"]);
});

test("sorts both directions with the existing missing-value ordering", () => {
  const expected: Record<SortKey, string[]> = {
    name: ["alpha", "beta", "unknown"], providerName: ["alpha", "beta", "unknown"],
    release: ["unknown", "beta", "alpha"], updated: ["unknown", "beta", "alpha"],
    context: ["unknown", "alpha", "beta"], inputCost: ["alpha", "beta", "unknown"],
    outputCost: ["beta", "alpha", "unknown"],
  };
  for (const sort of Object.keys(expected) as SortKey[]) {
    assert.deepEqual(ids({ sort }), expected[sort]);
    assert.deepEqual(ids({ sort, sortDirection: "descending" }), expected[sort].toReversed());
  }
});

test("rolling release windows include recent models and exclude undated models", () => {
  const dated = [30, 120, 200].map(days => ({
    id: String(days), name: String(days),
    release_date: new Date(Date.now() - days * 86_400_000).toISOString(),
  }));
  const datedIndex = buildModelIndex({ p: { id: "p", name: "OpenAI", models:
    Object.fromEntries([...dated, models[2]].map(model => [model.id, model])),
  } });
  const result = (releaseFilter: "last90" | "last180") => filterModels(datedIndex, {
    ...defaults, releaseFilter,
  }).visible.map(row => row.id);
  assert.deepEqual(result("last90"), ["30"]);
  assert.deepEqual(result("last180"), ["120", "30"]);
});

test("counts all matches while limiting rendered rows", () => {
  const many = Array.from({ length: 300 }, (_, i) => ({ id: String(i), name: String(i) }));
  const largeIndex = buildModelIndex({ p: { id: "p", name: "OpenAI", models:
    Object.fromEntries(many.map(model => [model.id, model])),
  } });
  const result = filterModels(largeIndex, defaults);
  assert.equal(result.filteredCount, 300);
  assert.equal(result.visible.length, 250);
});

test("frontier defaults use available providers and require an exact selection", () => {
  const available = getAvailableFrontierProviders(["OpenAI", "Other", "Google"]);
  assert.deepEqual(available, ["OpenAI", "Google"]);
  assert.equal(isExactProviderSelection(new Set(["Google", "OpenAI"]), available), true);
  assert.equal(isExactProviderSelection(new Set(["OpenAI", "Other"]), available), false);
});
