import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Database, FlaskConical, Layers3 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Dashboard } from "../types";
import {
  date,
  Empty,
  ErrorMessage,
  Loading,
  PageHeader,
  Panel,
  percent,
  RunLink,
  Status,
} from "../ui";

export default function DashboardPage() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api<Dashboard>("/dashboard"),
    refetchInterval: 5000,
  });
  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorMessage error={query.error} />;
  const data = query.data;
  return (
    <>
      <PageHeader
        eyebrow="OVERVIEW"
        title="Measure what your model actually does."
        description="Run repeatable evaluations, inspect every response, and compare changes over time."
        action={
          <Link className="button primary" to="/runs">
            New evaluation <ArrowRight size={16} />
          </Link>
        }
      />
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-top">
            <span>Datasets</span>
            <Database size={18} />
          </div>
          <strong>{data.datasets}</strong>
          <small>Test collections</small>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>Test cases</span>
            <Layers3 size={18} />
          </div>
          <strong>{data.test_cases}</strong>
          <small>Across all datasets</small>
        </div>
        <div className="stat-card">
          <div className="stat-top">
            <span>Evaluation runs</span>
            <FlaskConical size={18} />
          </div>
          <strong>{data.runs}</strong>
          <small>Tracked experiments</small>
        </div>
        <div className="stat-card accent">
          <div className="stat-top">
            <span>Mean run score</span>
            <span className="accent-mark">↗</span>
          </div>
          <strong>{percent(data.average_score)}</strong>
          <small>Across completed runs</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <Panel
          title="Recent runs"
          action={
            <Link className="text-link" to="/runs">
              View all <ArrowRight size={15} />
            </Link>
          }
        >
          {data.recent_runs.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Status</th>
                    <th>Score</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <RunLink run={run} />
                      </td>
                      <td>
                        <Status status={run.status} />
                      </td>
                      <td className="mono">
                        {percent(run.metrics?.average_score)}
                      </td>
                      <td className="muted">{date(run.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No evaluations yet"
              body="Create a dataset, prompt, and provider to run your first experiment."
              action={
                <Link className="button" to="/datasets">
                  Create dataset
                </Link>
              }
            />
          )}
        </Panel>
        <Panel title="Workflow" className="workflow-panel">
          <div className="workflow-step">
            <b>01</b>
            <div>
              <strong>Build a dataset</strong>
              <p>Define inputs and expected outputs.</p>
            </div>
          </div>
          <div className="workflow-step">
            <b>02</b>
            <div>
              <strong>Version a prompt</strong>
              <p>Keep each template immutable.</p>
            </div>
          </div>
          <div className="workflow-step">
            <b>03</b>
            <div>
              <strong>Run & compare</strong>
              <p>Review scores, latency, and case changes.</p>
            </div>
          </div>
          <Link className="text-link workflow-link" to="/datasets">
            Start with a dataset <ArrowRight size={15} />
          </Link>
        </Panel>
      </div>
    </>
  );
}
