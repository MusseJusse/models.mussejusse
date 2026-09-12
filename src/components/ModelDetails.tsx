import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Row } from "../lib/models";

const compactFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const numberFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

export const formatLimit = (value?: number) =>
  typeof value === "number"
    ? value >= 1_000_000
      ? compactFormat.format(value)
      : numberFormat.format(value)
    : "Unknown";

export const formatCost = (value?: number) =>
  typeof value === "number" ? `$${value.toFixed(value < 1 ? 3 : 2)}` : "Unknown";

export default function ModelDetails({ row, inline = false }: { row: Row; inline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copyId = async () => {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(row.id);
      setCopyFailed(false);
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  };

  const capabilities = [
    row.reasoning ? "Reasoning" : null,
    row.tool_call ? "Tools" : null,
    row.modalities?.input?.includes("image") ? "Vision" : null,
  ].filter((label): label is string => label !== null);

  const context = row.limit?.context;
  const output = row.limit?.output;
  const share = typeof context === "number" && context > 0 && typeof output === "number"
    ? Math.min(100, (output / context) * 100)
    : undefined;
  const inputModalities = row.modalities?.input?.join(", ");

  return (
    <div className="model-details">
      {!inline ? (
        <header>
          <h2>{row.name}</h2>
          <span>{row.providerName}</span>
        </header>
      ) : null}

      {!inline ? (
        <div className="detail-id">
          <code>{row.id}</code>
          <button type="button" data-copied={copied} onClick={copyId} aria-label={`Copy model ID ${row.id}`}>
            {copied ? <CheckIcon weight="bold" aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
            {copied ? "Copied" : "Copy ID"}
          </button>
        </div>
      ) : null}

      <dl className="detail-facts">
        <div><dt>Context</dt><dd>{formatLimit(context)}</dd></div>
        <div><dt>Max output</dt><dd>{formatLimit(output)}</dd></div>
        <div><dt>Input / 1M</dt><dd>{formatCost(row.cost?.input)}</dd></div>
        <div><dt>Output / 1M</dt><dd>{formatCost(row.cost?.output)}</dd></div>
        {inline ? <div><dt>Modalities</dt><dd>{inputModalities ? `${inputModalities} in` : "Unknown"}</dd></div> : null}
      </dl>

      {!inline && share !== undefined ? (
        <div className="detail-share">
          <span>Output vs context <strong>{Math.round(share)}%</strong></span>
          <div className="detail-bar" aria-hidden="true"><i style={{ width: `${share}%` }} /></div>
        </div>
      ) : null}

      <div className="detail-tags">
        {capabilities.map((label) => <span className="enabled" key={label}>{label}</span>)}
        {inline ? (
          <button type="button" className="detail-copy-pill" data-copied={copied} onClick={copyId} aria-label={`Copy model ID ${row.id}`}>
            {copied ? "Copied" : "Copy ID"}
          </button>
        ) : (
          <span>
            {row.open_weights === undefined ? "Weights unknown" : row.open_weights ? "Open weights" : "Closed weights"}
          </span>
        )}
      </div>

      {copyFailed ? (
        <p className="detail-copy-error" role="status">
          {inline ? "Couldn't copy automatically." : "Couldn't copy automatically. Select the ID to copy it."}
        </p>
      ) : null}

      {!inline ? (
        <p className="detail-dates">
          {row.release_date ? `Released ${row.release_date}` : "Release date unknown"}
          {" · "}
          {row.last_updated ? `Updated ${row.last_updated}` : "Update date unknown"}
        </p>
      ) : null}
    </div>
  );
}
