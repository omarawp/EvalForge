import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { Change, Comparison, Run } from "../types";
import {
  ErrorMessage,
  formatValue,
  Loading,
  millis,
  money,
  PageHeader,
  Panel,
  percent,
} from "../ui";

function delta(
  value: number | null | undefined,
  kind: "percent" | "ms" | "money" | "number",
) {
  if (value == null) return "—";
  const prefix = value > 0 ? "+" : "";
  if (kind === "percent") return `${prefix}${(value * 100).toFixed(1)} pp`;
  if (kind === "ms")
    return `${prefix}${Math.abs(value) < 1 ? value.toFixed(2) : value.toFixed(0)} ms`;
  if (kind === "money")
    return `${prefix}${value < 0 ? "-" : ""}${money(Math.abs(value))}`;
  return `${prefix}${value}`;
}

function ChangeList({ title, items }: { title: string; items: Change[] }) {
  return (
    <Panel
      title={title}
      action={<span className="count">{items.length} cases</span>}
    >
      {items.length ? (
        <div className="changes">
          {items.map((item) => (
            <div className="change-row" key={item.test_case_id}>
              <span
                className="change-case"
                title={formatValue(item.input, 500)}
              >
                {formatValue(item.input, 45)}
              </span>
              <span>
                {percent(item.previous)} → {percent(item.current)}
              </span>
              <b className={item.delta < 0 ? "negative" : "positive"}>
                {delta(item.delta, "percent")}
              </b>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted pad">No case-level score changes.</p>
      )}
    </Panel>
  );
}

export default function ComparePage() {
  const [params, setParams] = useSearchParams();
  const a = params.get("run_a") ?? "";
  const b = params.get("run_b") ?? "";
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<Run[]>("/runs"),
  });
  const completed =
    runs.data?.filter((run) => run.status === "completed") ?? [];
  const comparison = useQuery({
    queryKey: ["comparison", a, b],
    queryFn: () =>
      api<Comparison>(
        `/comparisons?run_a=${encodeURIComponent(a)}&run_b=${encodeURIComponent(b)}`,
      ),
    enabled: !!a && !!b,
  });
  const selectedA = completed.find((run) => run.id === a);
  const selectedB = completed.find((run) => run.id === b);
  const rows = comparison.data
    ? [
        [
          "Cases processed",
          String(comparison.data.run_a.result_count),
          String(comparison.data.run_b.result_count),
          "—",
        ],
        [
          "Mean score",
          percent(comparison.data.run_a.average_score),
          percent(comparison.data.run_b.average_score),
          delta(comparison.data.deltas.average_score, "percent"),
        ],
        [
          "Pass rate",
          percent(comparison.data.run_a.pass_rate),
          percent(comparison.data.run_b.pass_rate),
          delta(comparison.data.deltas.pass_rate, "percent"),
        ],
        [
          "Mean latency",
          millis(comparison.data.run_a.latency_ms.mean),
          millis(comparison.data.run_b.latency_ms.mean),
          delta(comparison.data.deltas.average_latency_ms, "ms"),
        ],
        [
          "P95 latency",
          millis(comparison.data.run_a.latency_ms.p95),
          millis(comparison.data.run_b.latency_ms.p95),
          "—",
        ],
        [
          "Estimated cost",
          money(comparison.data.run_a.estimated_cost),
          money(comparison.data.run_b.estimated_cost),
          delta(comparison.data.deltas.estimated_cost, "money"),
        ],
        [
          "Failed requests",
          String(comparison.data.run_a.failed_requests),
          String(comparison.data.run_b.failed_requests),
          delta(comparison.data.deltas.failed_requests, "number"),
        ],
      ]
    : [];
  return (
    <>
      <PageHeader
        eyebrow="EXPERIMENT ANALYSIS"
        title="Compare runs"
        description="See measured changes between two completed runs over the same dataset."
      />
      <Panel title="Select experiments">
        <div className="form-grid compare-select">
          <label>
            Baseline run
            <select
              value={a}
              onChange={(event) =>
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set("run_a", event.target.value);
                  next.delete("run_b");
                  return next;
                })
              }
            >
              <option value="">Choose a run</option>
              {completed.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comparison run
            <select
              value={b}
              onChange={(event) =>
                setParams((current) => {
                  const next = new URLSearchParams(current);
                  next.set("run_b", event.target.value);
                  return next;
                })
              }
            >
              <option value="">Choose a run</option>
              {completed
                .filter(
                  (run) =>
                    !selectedA ||
                    (run.dataset_id === selectedA.dataset_id &&
                      JSON.stringify(run.evaluator_specs) ===
                        JSON.stringify(selectedA.evaluator_specs)),
                )
                .map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {runs.error && <ErrorMessage error={runs.error} />}
      </Panel>
      {comparison.isLoading && <Loading />}
      {comparison.error && <ErrorMessage error={comparison.error} />}
      {comparison.data && (
        <>
          <Panel title="Measurement comparison">
            <div className="table-scroll">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>{selectedA?.name ?? "Run A"}</th>
                    <th>{selectedB?.name ?? "Run B"}</th>
                    <th>Delta (B − A)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row[0]}>
                      <td>{row[0]}</td>
                      <td className="mono">{row[1]}</td>
                      <td className="mono">{row[2]}</td>
                      <td className="mono">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div className="comparison-changes">
            <ChangeList
              title="Regressions"
              items={comparison.data.regressions}
            />
            <ChangeList
              title="Improvements"
              items={comparison.data.improvements}
            />
          </div>
        </>
      )}
      {!a || !b ? (
        <Panel>
          <p className="muted pad">
            Select two completed runs to compare metrics and case-level score
            changes.
          </p>
        </Panel>
      ) : null}
    </>
  );
}
