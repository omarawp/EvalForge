import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, GitCompareArrows, X } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { Result, Run } from "../types";
import {
  date,
  Empty,
  ErrorMessage,
  formatValue,
  Loading,
  millis,
  money,
  PageHeader,
  Panel,
  percent,
  Status,
} from "../ui";

function DataBlock({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="data-block">
      <strong>{label}</strong>
      <pre>
        {typeof value === "string"
          ? value
          : (JSON.stringify(value, null, 2) ?? "—")}
      </pre>
    </div>
  );
}

export default function RunPage() {
  const { id } = useParams();
  const client = useQueryClient();
  const [selected, setSelected] = useState<Result | null>(null);
  const run = useQuery({
    queryKey: ["run", id],
    queryFn: () => api<Run>(`/runs/${id}`),
    enabled: !!id,
    refetchInterval: (query) =>
      ["pending", "running"].includes(query.state.data?.status ?? "")
        ? 1500
        : false,
  });
  const results = useQuery({
    queryKey: ["results", id],
    queryFn: () => api<Result[]>(`/runs/${id}/results`),
    enabled: !!id,
    refetchInterval:
      run.data && ["pending", "running"].includes(run.data.status)
        ? 1500
        : false,
  });
  const cancel = useMutation({
    mutationFn: () => api<Run>(`/runs/${id}/cancel`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["run", id] }),
  });
  if (run.isLoading) return <Loading />;
  if (run.error || !run.data) return <ErrorMessage error={run.error} />;
  const data = run.data;
  const metrics = data.metrics;
  return (
    <>
      <Link className="back-link" to="/runs">
        <ArrowLeft size={16} /> Evaluation runs
      </Link>
      <PageHeader
        eyebrow="RUN / RESULTS"
        title={data.name}
        description={`Created ${date(data.created_at)} · ${data.result_count} of ${data.total_cases} cases processed`}
        action={
          <div className="header-actions">
            <Status status={data.status} />
            {["pending", "running"].includes(data.status) && (
              <button
                className="button"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel
              </button>
            )}
            <Link className="button" to={`/compare?run_a=${data.id}`}>
              <GitCompareArrows size={16} /> Compare
            </Link>
          </div>
        }
      />
      <ErrorMessage error={data.error || cancel.error || results.error} />
      {["pending", "running"].includes(data.status) && (
        <div className="progress-wrap">
          <div className="progress-track">
            <div
              style={{
                width: `${data.total_cases ? (100 * data.result_count) / data.total_cases : 0}%`,
              }}
            />
          </div>
          <span>
            {data.result_count}/{data.total_cases} complete · refreshing
            automatically
          </span>
        </div>
      )}
      <div className="metric-grid">
        <div className="metric">
          <span>Mean score</span>
          <strong>{percent(metrics?.average_score)}</strong>
        </div>
        <div className="metric">
          <span>Pass rate</span>
          <strong>{percent(metrics?.pass_rate)}</strong>
        </div>
        <div className="metric">
          <span>Average latency</span>
          <strong>{millis(metrics?.latency_ms.mean)}</strong>
        </div>
        <div className="metric">
          <span>P50 / P95 latency</span>
          <strong>
            {millis(metrics?.latency_ms.p50)} <em>/</em>{" "}
            {millis(metrics?.latency_ms.p95)}
          </strong>
        </div>
        <div className="metric">
          <span>Input / output tokens</span>
          <strong>
            {metrics
              ? `${metrics.input_tokens} / ${metrics.output_tokens}`
              : "—"}
          </strong>
        </div>
        <div className="metric">
          <span>Estimated cost</span>
          <strong>{money(metrics?.estimated_cost)}</strong>
        </div>
        <div className="metric">
          <span>Failed requests</span>
          <strong>{metrics?.failed_requests ?? "—"}</strong>
        </div>
        <div className="metric">
          <span>Evaluator errors</span>
          <strong>{metrics?.evaluator_errors ?? "—"}</strong>
        </div>
      </div>
      <Panel
        title="Case results"
        action={<span className="count">Click a row to inspect</span>}
      >
        {results.isLoading ? (
          <Loading />
        ) : results.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Test input</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Score</th>
                  <th>Latency</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {results.data.map((result) => {
                  const score = result.scores.length
                    ? result.scores.reduce((sum, item) => sum + item.score, 0) /
                      result.scores.length
                    : null;
                  return (
                    <tr
                      key={result.id}
                      className="clickable-row"
                      onClick={() => setSelected(result)}
                    >
                      <td className="case-cell">
                        {formatValue(result.input, 60)}
                      </td>
                      <td className="case-cell">
                        {formatValue(result.expected_output, 60)}
                      </td>
                      <td className="case-cell">
                        {result.error
                          ? "—"
                          : formatValue(result.actual_output, 60)}
                      </td>
                      <td className="mono">{percent(score)}</td>
                      <td className="mono">{millis(result.latency_ms)}</td>
                      <td className="mono">
                        {result.input_tokens == null
                          ? "—"
                          : `${result.input_tokens} / ${result.output_tokens}`}
                      </td>
                      <td className="mono">{money(result.estimated_cost)}</td>
                      <td>
                        {result.error ? (
                          <span className="result-error">Error</span>
                        ) : (
                          <span className="result-ok">Recorded</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Waiting for results"
            body="Results appear as the worker completes each case."
          />
        )}
      </Panel>
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside
            className="drawer"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="drawer-header">
              <div>
                <div className="eyebrow">CASE DETAIL</div>
                <h2>Recorded response</h2>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="drawer-content">
              <DataBlock label="Input" value={selected.input} />
              <DataBlock
                label="Rendered prompt"
                value={selected.rendered_prompt}
              />
              <DataBlock
                label="Expected output"
                value={selected.expected_output}
              />
              <DataBlock label="Actual output" value={selected.actual_output} />
              {selected.error && <ErrorMessage error={selected.error} />}
              <div className="data-block">
                <strong>Evaluator scores</strong>
                {selected.scores.length ? (
                  selected.scores.map((score) => (
                    <div className="score-line" key={score.id}>
                      <span>{score.evaluator_type}</span>
                      <b>{percent(score.score)}</b>
                      {Object.keys(score.details).length > 0 && (
                        <pre>{JSON.stringify(score.details, null, 2)}</pre>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="muted">No scores recorded</p>
                )}
              </div>
              <DataBlock
                label="Provider metadata"
                value={selected.provider_metadata}
              />
              <div className="drawer-foot">
                Latency {millis(selected.latency_ms)} · Tokens{" "}
                {selected.input_tokens ?? "—"} / {selected.output_tokens ?? "—"}{" "}
                · Cost {money(selected.estimated_cost)}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
