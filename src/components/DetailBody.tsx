import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Row } from "../lib/models";

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

export default function DetailBody({ row, variant = "panel" }: { row: Row; variant?: "panel" | "inline" }) {
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const copyModelId = async () => {
    await navigator.clipboard.writeText(row.id);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1200);
  };

  const outputLimit = row.limit?.output;
  const contextLimit = row.limit?.context;
  const outputShare =
    typeof contextLimit === "number" && contextLimit > 0 && typeof outputLimit === "number"
      ? Math.min(100, Math.round((outputLimit / contextLimit) * 100))
      : undefined;

  const capabilities = [
    [row.reasoning, "Reasoning"],
    [row.tool_call, "Tools"],
    [row.multimodal, "Vision"],
    [row.open_weights, "Open weights"],
  ] as const;
  const modalities = [...new Set([...(row.modalities?.input ?? []), ...(row.modalities?.output ?? [])])];

  return (
    <div className={`detail-body ${variant === "inline" ? "detail-body-inline" : ""}`}>
      {variant === "panel" ? (
        <div className="detail-title">
          <img src={`https://models.dev/logos/${row.providerId}.svg`} alt="" loading="lazy" onError={(event) => { event.currentTarget.style.display = "none"; }} />
          <strong>{row.name}</strong>
        </div>
      ) : null}
      <div className="detail-id">
        <code>{row.id}</code>
        <button type="button" className={copied ? "copied" : ""} onClick={copyModelId} aria-label={`Copy ${row.id}`}>
          {copied ? <CheckIcon weight="bold" aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          <span>{copied ? "Copied" : "Copy ID"}</span>
        </button>
      </div>

      <dl className="detail-facts">
        <div><dt>Context</dt><dd>{limit(contextLimit)}</dd></div>
        <div><dt>Max output</dt><dd>{limit(outputLimit)}</dd></div>
        <div><dt>Input / 1M</dt><dd>{money(row.cost?.input)}</dd></div>
        <div><dt>Output / 1M</dt><dd>{money(row.cost?.output)}</dd></div>
        {modalities.length ? <div><dt>Modalities</dt><dd>{modalities.join(", ")}</dd></div> : null}
      </dl>

      {typeof outputShare === "number" ? (
        <div className="detail-share">
          <small>Output vs context</small>
          <div className="detail-bar"><i style={{ width: `${outputShare}%` }} /></div>
        </div>
      ) : null}

      <div className="detail-tags">
        {capabilities.filter(([enabled]) => enabled).map(([, label]) => (
          <span key={label} className="detail-tag on">{label}</span>
        ))}
        {capabilities.every(([enabled]) => !enabled) ? <span className="detail-tag">No capabilities listed</span> : null}
        {row.open_weights ? null : <span className="detail-tag">Closed</span>}
      </div>

      <p className="detail-dates">
        Released {row.release_date ?? "unknown"} · Updated {row.last_updated ?? "unknown"}
      </p>
    </div>
  );
}
