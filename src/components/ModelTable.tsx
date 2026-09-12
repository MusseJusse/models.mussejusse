import { BrainIcon, CheckIcon, CodeIcon, CopyIcon, DatabaseIcon, EyeIcon, MagnifyingGlassIcon, WrenchIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ExplorerState } from "../hooks/useModelData";
import type { Row, SortKey } from "../lib/models";
import DetailBody from "./DetailBody";

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

export default function ModelTable({ state }: { state: ExplorerState }) {
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

  const rowKey = (row: Row) => `${row.providerId}:${row.id}`;
  const selectedKey = state.selectedId;
  const selectRow = (row: Row) => state.toggleRow(row);
  const showDetail = state.selectedRow !== undefined;

  return (
    <section
      className={`table-viewport ${showDetail ? "has-detail" : ""}`}
      aria-label="AI models"
    >
      <div className={showDetail ? "table-split has-detail" : "table-split solo"}>
        <div className={showDetail ? "table-canvas" : "table-scroll"}>
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
            <TableState icon={<DatabaseIcon />} title="Catalog unavailable" message={state.error} action="Try again" onAction={() => window.location.reload()} />
          ) : state.isLoading ? (
            <LoadingRows />
          ) : state.visible.length === 0 ? (
            <TableState icon={<MagnifyingGlassIcon />} title="No matching models" message="Change or reset the active filters." action="Reset filters" onAction={state.reset} />
          ) : (
            <div className="table-body">
              {state.visible.map((row) => {
                const key = rowKey(row);
                const isSelected = key === selectedKey;
                return (
                  <div key={key}>
                    <div
                      className={`table-grid model-row ${isSelected ? "selected" : ""}`}
                      role="row"
                      aria-selected={isSelected}
                    >
                      <div className="cell provider-cell" role="cell">
                        <img src={`https://models.dev/logos/${row.providerId}.svg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                        <span>{row.providerName}</span>
                      </div>
                      <button
                        type="button"
                        className="cell model-cell detail-trigger"
                        role="cell"
                        onClick={() => selectRow(row)}
                        aria-expanded={isSelected}
                        title={isSelected ? "Collapse details" : "Show details"}
                      >
                        <strong>{row.name}</strong>
                        {row.family ? <small>{row.family}</small> : null}
                      </button>
                      <div className="cell id-cell" role="cell">
                        <code>{row.id}</code>
                        <button type="button" onClick={() => copyModelId(row.id)} aria-label={`Copy ${row.id}`}>
                          {copiedId === row.id ? <CheckIcon weight="bold" aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
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
                    {isSelected ? (
                      <div className="row-detail" role="region" aria-label={`${row.name} details`}>
                        <DetailBody row={row} variant="inline" />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {showDetail && state.selectedRow ? (
          <aside className="detail-panel" aria-label={`${state.selectedRow.name} details`}>
            <DetailBody row={state.selectedRow} />
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function SortHeader({ label, description, sort, state }: { label: string; description?: string; sort: SortKey; state: ExplorerState }) {
  const active = state.sort === sort;
  return (
    <button
      className={`header-cell ${active ? "active" : ""}`}
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
    [row.reasoning, BrainIcon, "Reasoning"],
    [row.tool_call, WrenchIcon, "Tool calling"],
    [row.multimodal, EyeIcon, "Multimodal input"],
    [row.open_weights, CodeIcon, "Open weights"],
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
    <div className="table-body" aria-label="Loading model data">
      {Array.from({ length: 18 }).map((_, row) => (
        <div className="table-grid model-row" key={row} aria-hidden="true">
          {Array.from({ length: 10 }).map((__, cell) => <div className="cell" key={cell}><span className={`loading-line size-${(row + cell) % 3}`} /></div>)}
        </div>
      ))}
    </div>
  );
}

function TableState({ icon, title, message, action, onAction }: { icon: ReactNode; title: string; message: string; action: string; onAction: () => void }) {
  return (
    <div className="table-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{message}</p>
      <button type="button" onClick={onAction}>{action}</button>
    </div>
  );
}
