import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Run } from "./types";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Panel({
  title,
  children,
  action,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">◇</div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}

export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <div className="error" role="alert">
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null;
}

export function Loading() {
  return <div className="loading">Loading workspace…</div>;
}

export function Status({ status }: { status: Run["status"] }) {
  return (
    <span className={`status status-${status}`}>
      <i />
      {status}
    </span>
  );
}

export function RunLink({ run }: { run: Run }) {
  return (
    <Link className="table-link" to={`/runs/${run.id}`}>
      {run.name}
    </Link>
  );
}

export function formatValue(value: unknown, limit = 90): string {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

export function percent(value: number | null | undefined) {
  return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}
export function millis(value: number | null | undefined) {
  return value == null
    ? "—"
    : `${value < 1 ? value.toFixed(2) : value < 10 ? value.toFixed(1) : value.toFixed(0)} ms`;
}
export function money(value: number | null | undefined) {
  return value == null ? "—" : `$${value.toFixed(value < 0.01 ? 6 : 4)}`;
}
export function date(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}
