import { CaretDownIcon, DatabaseIcon, MagnifyingGlassIcon, XIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ExplorerState } from "../hooks/useModelData";
import type { Row, SortKey } from "../lib/models";
import ModelDetails, { formatCost, formatLimit } from "./ModelDetails";

const rowKey = (row: Row) => `${row.providerId}:${row.id}`;
const columns = ["provider", "model", "context", "input", "output"] as const;

export default function ModelTable({ state }: { state: ExplorerState }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const selected = state.visible.find((row) => rowKey(row) === selectedKey) ?? null;

  // A selected model that a filter removes should not come back when the filter clears.
  useEffect(() => {
    if (selectedKey && !selected) setSelectedKey(null);
  }, [selectedKey, selected]);

  const toggle = (key: string) => setSelectedKey((current) => (current === key ? null : key));
  const close = () => {
    setSelectedKey(null);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <section
      className="model-view"
      aria-label="AI models"
      onKeyDown={(event) => {
        if (event.key === "Escape" && selectedKey) {
          event.stopPropagation();
          close();
        }
      }}
    >
      {state.error ? (
        <TableState icon={<DatabaseIcon />} title="Catalog unavailable" message={state.error} action="Try again" onAction={() => window.location.reload()} />
      ) : state.isLoading ? (
        <LoadingRows />
      ) : !state.visible.length ? (
        <TableState icon={<MagnifyingGlassIcon />} title="No matching models" message="Change or reset the active filters." action="Reset filters" onAction={state.reset} />
      ) : (
        <div className={`model-split${selected ? " has-selection" : ""}`}>
          <div className="model-list">
            <table className="model-table">
              <caption className="sr-only">Model pricing per million tokens and context limits. Select a model for full details.</caption>
              <colgroup>
                {columns.map((column) => <col key={column} className={`${column}-column`} />)}
              </colgroup>
              <thead>
                <tr>
                  <SortHeader label="Provider" sort="providerName" state={state} />
                  <SortHeader label="Model" sort="name" state={state} />
                  <SortHeader label="Context" sort="context" state={state} />
                  <SortHeader label="In / 1M" sort="inputCost" state={state} />
                  <SortHeader label="Out / 1M" sort="outputCost" state={state} />
                </tr>
              </thead>
              <tbody>
                {state.visible.map((row) => {
                  const key = rowKey(row);
                  const open = key === selectedKey;
                  return (
                    <tr
                      key={key}
                      className={open ? "is-selected" : ""}
                      onClick={(event) => {
                        const button = event.currentTarget.querySelector<HTMLButtonElement>(".model-name-button");
                        if (button) triggerRef.current = button;
                        toggle(key);
                      }}
                    >
                      <td>
                        <span className="provider-name"><ProviderLogo row={row} /><span>{row.providerName}</span></span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="model-name-button"
                          aria-expanded={open}
                          aria-controls={open ? "model-detail-panel" : undefined}
                        >
                          {row.name}
                        </button>
                      </td>
                      <td className="numeric">{formatLimit(row.limit?.context)}</td>
                      <td className="numeric">{formatCost(row.cost?.input)}</td>
                      <td className="numeric">{formatCost(row.cost?.output)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <ul className="mobile-models">
              {state.visible.map((row) => {
                const key = rowKey(row);
                const open = key === selectedKey;
                const detailId = `mobile-details-${key.replace(":", "-")}`;
                return (
                  <li key={key} className={open ? "is-open" : ""}>
                    <button
                      type="button"
                      className="mobile-model-row"
                      aria-expanded={open}
                      aria-controls={detailId}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        toggle(key);
                      }}
                    >
                      <ProviderLogo row={row} />
                      <span className="mobile-model-name">
                        <strong>{row.name}</strong>
                        {open ? <small>{row.id}</small> : null}
                      </span>
                      {!open ? (
                        <span className="mobile-model-stats">
                          {formatLimit(row.limit?.context)}
                          <span aria-hidden="true"> · </span>
                          {formatCost(row.cost?.input)}
                          <span className="sr-only"> input per million tokens</span>
                        </span>
                      ) : null}
                      <CaretDownIcon className="mobile-chevron" data-open={open} aria-hidden="true" />
                    </button>
                    <div className="mobile-model-detail" data-open={open} id={detailId}>
                      {open ? <div className="mobile-model-detail-inner"><ModelDetails row={row} inline /></div> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          {selected ? (
            <aside className="model-detail-panel" id="model-detail-panel" aria-label={`${selected.name} details`}>
              <button type="button" className="detail-close" onClick={close} aria-label="Close details"><XIcon aria-hidden="true" /></button>
              <ModelDetails key={rowKey(selected)} row={selected} />
            </aside>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ProviderLogo({ row }: { row: Row }) {
  return (
    <img
      className="provider-logo"
      src={`https://models.dev/logos/${row.providerId}.svg`}
      alt=""
      loading="lazy"
      onError={(event) => { event.currentTarget.style.visibility = "hidden"; }}
    />
  );
}

function SortHeader({ label, sort, state }: { label: string; sort: SortKey; state: ExplorerState }) {
  const active = state.sort === sort;
  return (
    <th scope="col" aria-sort={active ? state.sortDirection : "none"}>
      <button type="button" className={active ? "active" : ""} onClick={() => state.selectSort(sort)}>
        {label}{active ? state.sortDirection === "ascending" ? " ↑" : " ↓" : ""}
      </button>
    </th>
  );
}

function LoadingRows() {
  return (
    <div className="model-split">
      <div className="model-list" aria-busy="true" aria-label="Loading model data">
        <table className="model-table">
          <colgroup>
            {columns.map((column) => <col key={column} className={`${column}-column`} />)}
          </colgroup>
          <tbody>
            {Array.from({ length: 12 }).map((_, row) => (
              <tr key={row} aria-hidden="true">
                {columns.map((column, cell) => (
                  <td key={column}><span className={`loading-line size-${(row + cell) % 3}`} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TableState({ icon, title, message, action, onAction }: { icon: ReactNode; title: string; message: string; action: string; onAction: () => void }) {
  return <div className="table-state"><span>{icon}</span><strong>{title}</strong><p>{message}</p><button type="button" onClick={onAction}>{action}</button></div>;
}
