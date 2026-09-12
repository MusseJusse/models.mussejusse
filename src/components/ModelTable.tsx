import { BrainIcon, CheckIcon, CodeIcon, CopyIcon, DatabaseIcon, EyeIcon, MagnifyingGlassIcon, WrenchIcon, XIcon } from "@phosphor-icons/react";
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
  const { clearSelection } = state;
  const hasDetail = state.selectedRow !== undefined;

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector(".provider-picker[open], .release-picker[open]")) return;
      clearSelection();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [clearSelection]);

  const copyModelId = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(""), 1400);
  };

  return (
    <section className={`table-viewport ${hasDetail ? "has-detail" : ""}`} aria-label="AI models">
      <div className="table-split">
        <div className="table-region">
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
                const key = `${row.providerId}:${row.id}`;
                const open = key === state.selectedId;
                return (
                  <div className="model-item" key={key}>
                    <div
                      className={`table-grid model-row ${open ? "selected" : ""}`}
                      role="row"
                      aria-selected={open}
                      onClick={() => state.selectRow(row)}
                    >
                      <div className="cell provider-cell" role="cell">
                        <img src={`https://models.dev/logos/${row.providerId}.svg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                        <span>{row.providerName}</span>
                      </div>
                      <button
                        type="button"
                        className="cell model-cell detail-trigger"
                        onClick={(event) => {
                          event.stopPropagation();
                          state.selectRow(row);
                        }}
                        aria-expanded={open}
                        title={open ? "Hide details" : "Show details"}
                      >
                        <img className="model-logo" src={`https://models.dev/logos/${row.providerId}.svg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
                        <span className="model-copy">
                          <strong>{row.name}</strong>
                          {row.family ? <small>{row.family}</small> : null}
                        </span>
                      </button>
                      <div className="cell id-cell" role="cell">
                        <code>{row.id}</code>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            copyModelId(row.id);
                          }}
                          aria-label={`Copy ${row.id}`}
                        >
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
                    {open ? (
                      <div className="row-detail" role="region" aria-label={`${row.name} details`}>
                        <div className="row-detail-inner">
                          <DetailBody row={row} variant="inline" />
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {hasDetail && state.selectedRow ? (
          <aside className="detail-panel" aria-label={`${state.selectedRow.name} details`}>
            <button type="button" className="detail-close" onClick={clearSelection} aria-label="Close details">
              <XIcon aria-hidden="true" />
            </button>
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
