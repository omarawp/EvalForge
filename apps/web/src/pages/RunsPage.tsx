import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Play } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { api, json } from "../api";
import type { Dataset, Prompt, Provider, Run } from "../types";
import {
  date,
  Empty,
  ErrorMessage,
  Loading,
  millis,
  PageHeader,
  Panel,
  percent,
  RunLink,
  Status,
} from "../ui";

const evaluators = [
  { value: "exact_match", label: "Exact match" },
  { value: "contains", label: "Contains" },
  { value: "json_validity", label: "JSON validity" },
  { value: "json_schema", label: "JSON schema" },
  { value: "semantic_similarity", label: "Token overlap similarity" },
];

export default function RunsPage() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [promptVersionId, setPromptVersionId] = useState("");
  const [providerId, setProviderId] = useState("");
  const [selectedEvaluators, setSelectedEvaluators] = useState(["exact_match"]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [normalizeWhitespace, setNormalizeWhitespace] = useState(true);
  const datasets = useQuery({
    queryKey: ["datasets"],
    queryFn: () => api<Dataset[]>("/datasets"),
  });
  const prompts = useQuery({
    queryKey: ["prompts"],
    queryFn: () => api<Prompt[]>("/prompts"),
  });
  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<Provider[]>("/providers"),
  });
  const runs = useQuery({
    queryKey: ["runs"],
    queryFn: () => api<Run[]>("/runs"),
    refetchInterval: 5000,
  });
  const create = useMutation({
    mutationFn: () =>
      api<Run>(
        "/runs",
        json("POST", {
          name,
          dataset_id: datasetId || datasets.data?.[0]?.id,
          prompt_version_id:
            promptVersionId || prompts.data?.flatMap((p) => p.versions)[0]?.id,
          provider_configuration_id:
            providerId ||
            providers.data?.find((p) => p.credential_available)?.id,
          evaluators: selectedEvaluators.map((type) => ({
            type,
            config:
              type === "exact_match"
                ? {
                    case_sensitive: caseSensitive,
                    normalize_whitespace: normalizeWhitespace,
                  }
                : {},
          })),
        }),
      ),
    onSuccess: (run) => {
      client.invalidateQueries({ queryKey: ["runs"] });
      navigate(`/runs/${run.id}`);
    },
  });
  const ready =
    !!datasets.data?.length &&
    !!prompts.data?.length &&
    !!providers.data?.some((p) => p.credential_available);
  return (
    <>
      <PageHeader
        eyebrow="EXPERIMENTS"
        title="Evaluation runs"
        description="Run one prompt version and model against a complete dataset, then inspect the evidence."
        action={
          <button
            className="button primary"
            onClick={() => setShowForm((v) => !v)}
          >
            <Play size={16} /> New run
          </button>
        }
      />
      {showForm && (
        <Panel title="Configure evaluation" className="form-panel">
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="form-grid">
              <label>
                Run name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Mock baseline · prompt v1"
                />
              </label>
              <label>
                Dataset
                <select
                  required
                  value={datasetId || datasets.data?.[0]?.id || ""}
                  onChange={(event) => setDatasetId(event.target.value)}
                >
                  {datasets.data?.map((dataset) => (
                    <option key={dataset.id} value={dataset.id}>
                      {dataset.name} ({dataset.test_case_count} cases)
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prompt version
                <select
                  required
                  value={
                    promptVersionId ||
                    prompts.data?.flatMap((p) => p.versions)[0]?.id ||
                    ""
                  }
                  onChange={(event) => setPromptVersionId(event.target.value)}
                >
                  {prompts.data?.flatMap((prompt) =>
                    prompt.versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {prompt.name} · v{version.version}
                      </option>
                    )),
                  )}
                </select>
              </label>
              <label>
                Provider / model
                <select
                  required
                  value={
                    providerId ||
                    providers.data?.find((p) => p.credential_available)?.id ||
                    ""
                  }
                  onChange={(event) => setProviderId(event.target.value)}
                >
                  {providers.data?.map((provider) => (
                    <option
                      key={provider.id}
                      value={provider.id}
                      disabled={!provider.credential_available}
                    >
                      {provider.name} · {provider.model_name}
                      {provider.credential_available ? "" : " (key missing)"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div>
              <div className="field-label">Evaluators</div>
              <div className="check-grid">
                {evaluators.map((evaluator) => (
                  <label className="check" key={evaluator.value}>
                    <input
                      type="checkbox"
                      checked={selectedEvaluators.includes(evaluator.value)}
                      onChange={(event) =>
                        setSelectedEvaluators((current) =>
                          event.target.checked
                            ? [...current, evaluator.value]
                            : current.filter(
                                (item) => item !== evaluator.value,
                              ),
                        )
                      }
                    />
                    {evaluator.label}
                  </label>
                ))}
              </div>
            </div>
            {selectedEvaluators.includes("exact_match") && (
              <div className="check-grid">
                <label className="check">
                  <input
                    type="checkbox"
                    checked={!caseSensitive}
                    onChange={(event) =>
                      setCaseSensitive(!event.target.checked)
                    }
                  />
                  Ignore case
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={normalizeWhitespace}
                    onChange={(event) =>
                      setNormalizeWhitespace(event.target.checked)
                    }
                  />
                  Normalize whitespace
                </label>
              </div>
            )}
            {!ready && (
              <p className="help">
                Create a dataset, prompt, and ready provider first.
              </p>
            )}
            <button
              className="button primary"
              disabled={
                !ready || !selectedEvaluators.length || create.isPending
              }
            >
              Start evaluation <ArrowRight size={16} />
            </button>
            <ErrorMessage error={create.error} />
          </form>
        </Panel>
      )}
      <Panel
        title="Run history"
        action={<span className="count">{runs.data?.length ?? 0} runs</span>}
      >
        {runs.isLoading ? (
          <Loading />
        ) : runs.error ? (
          <ErrorMessage error={runs.error} />
        ) : runs.data?.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Progress</th>
                  <th>Score</th>
                  <th>Latency</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.data.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <RunLink run={run} />
                    </td>
                    <td>
                      <Status status={run.status} />
                    </td>
                    <td className="mono">
                      {run.result_count}/{run.total_cases}
                    </td>
                    <td className="mono">
                      {percent(run.metrics?.average_score)}
                    </td>
                    <td className="mono">
                      {millis(run.metrics?.latency_ms.mean)}
                    </td>
                    <td className="muted">{date(run.created_at)}</td>
                    <td>
                      <Link className="row-arrow" to={`/runs/${run.id}`}>
                        <ArrowRight size={16} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No runs yet"
            body="Start an evaluation to populate the experiment history."
          />
        )}
      </Panel>
    </>
  );
}
