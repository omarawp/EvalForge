import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Upload } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, json } from "../api";
import { parseImport, parseValue } from "../datasetImport";
import type { Dataset, TestCase } from "../types";
import {
  Empty,
  ErrorMessage,
  formatValue,
  Loading,
  PageHeader,
  Panel,
} from "../ui";

export default function DatasetPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [metadata, setMetadata] = useState("{}");
  const [jsonFields, setJsonFields] = useState(false);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const query = useQuery({
    queryKey: ["dataset", id],
    queryFn: () => api<Dataset>(`/datasets/${id}`),
    enabled: !!id,
  });
  const refresh = () => {
    client.invalidateQueries({ queryKey: ["dataset", id] });
    client.invalidateQueries({ queryKey: ["datasets"] });
    client.invalidateQueries({ queryKey: ["dashboard"] });
  };
  const add = useMutation({
    mutationFn: (body: unknown) =>
      api<Dataset>(`/datasets/${id}/test-cases`, json("POST", body)),
    onSuccess: () => {
      refresh();
      setInput("");
      setExpected("");
      setMetadata("{}");
    },
  });
  const bulk = useMutation({
    mutationFn: (body: unknown) =>
      api<Dataset>(`/datasets/${id}/import`, json("POST", body)),
    onSuccess: () => {
      refresh();
      setImportText("");
      setImportError("");
    },
  });
  const remove = useMutation({
    mutationFn: (caseId: string) =>
      api<void>(`/test-cases/${caseId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const deleteDataset = useMutation({
    mutationFn: () => api<void>(`/datasets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      refresh();
      navigate("/datasets");
    },
  });
  if (query.isLoading) return <Loading />;
  if (query.error || !query.data) return <ErrorMessage error={query.error} />;
  const dataset = query.data;
  return (
    <>
      <Link className="back-link" to="/datasets">
        <ArrowLeft size={16} /> Datasets
      </Link>
      <PageHeader
        eyebrow="DATASET / DETAIL"
        title={dataset.name}
        description={dataset.description || "A collection of evaluation cases."}
        action={
          <button
            className="button danger-quiet"
            onClick={() => {
              if (confirm(`Delete ${dataset.name}?`)) deleteDataset.mutate();
            }}
          >
            <Trash2 size={16} /> Delete
          </button>
        }
      />
      <ErrorMessage error={deleteDataset.error || remove.error} />
      <div className="detail-grid">
        <Panel
          title="Test cases"
          action={
            <span className="count">{dataset.test_case_count} cases</span>
          }
        >
          {dataset.test_cases?.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Input</th>
                    <th>Expected output</th>
                    <th>Metadata</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {dataset.test_cases.map((item: TestCase, index) => (
                    <tr key={item.id}>
                      <td className="mono muted">
                        {String(index + 1).padStart(2, "0")}
                      </td>
                      <td className="case-cell">{formatValue(item.input)}</td>
                      <td className="case-cell">
                        {formatValue(item.expected_output)}
                      </td>
                      <td className="muted case-cell">
                        {Object.keys(item.metadata).length
                          ? formatValue(item.metadata, 40)
                          : "—"}
                      </td>
                      <td>
                        <button
                          className="icon-button"
                          title="Delete case"
                          onClick={() => {
                            if (confirm("Delete this test case?"))
                              remove.mutate(item.id);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No test cases"
              body="Add a case or import a JSON or JSONL dataset."
            />
          )}
        </Panel>
        <Panel title="Add test cases" className="side-panel">
          <div className="tabs">
            <button
              className={tab === "single" ? "active" : ""}
              onClick={() => setTab("single")}
            >
              <Plus size={14} /> Single case
            </button>
            <button
              className={tab === "bulk" ? "active" : ""}
              onClick={() => setTab("bulk")}
            >
              <Upload size={14} /> Bulk import
            </button>
          </div>
          {tab === "single" ? (
            <form
              className="form-stack"
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const parsed = JSON.parse(metadata);
                  if (
                    !parsed ||
                    typeof parsed !== "object" ||
                    Array.isArray(parsed)
                  )
                    throw new Error("Metadata must be a JSON object.");
                  setImportError("");
                  add.mutate({
                    input: parseValue(input, jsonFields),
                    expected_output: parseValue(expected, jsonFields),
                    metadata: parsed,
                  });
                } catch (error) {
                  setImportError(String(error));
                }
              }}
            >
              <label>
                Input
                <textarea
                  required
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="What is the capital of Canada?"
                  rows={3}
                />
              </label>
              <label>
                Expected output
                <textarea
                  value={expected}
                  onChange={(event) => setExpected(event.target.value)}
                  placeholder="Ottawa"
                  rows={3}
                />
              </label>
              <label>
                Metadata JSON <span className="hint">optional</span>
                <textarea
                  value={metadata}
                  onChange={(event) => setMetadata(event.target.value)}
                  rows={2}
                />
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={jsonFields}
                  onChange={(event) => setJsonFields(event.target.checked)}
                />
                Interpret input and expected output as JSON
              </label>
              <button className="button primary" disabled={add.isPending}>
                Add case
              </button>
              <ErrorMessage error={add.error || importError} />
            </form>
          ) : (
            <div className="form-stack">
              <p className="help">
                Paste a JSON array or one JSON object per line. Each case needs{" "}
                <code>input</code> and <code>expected_output</code>.
              </p>
              <label>
                JSON or JSONL file
                <input
                  type="file"
                  accept=".json,.jsonl,application/json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (file.size > 1_000_000) {
                      setImportError("File exceeds 1 MB.");
                      return;
                    }
                    setImportText(await file.text());
                    setImportError("");
                  }}
                />
              </label>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={'[{"input":"2 + 2","expected_output":"4"}]'}
                rows={9}
              />
              <button
                className="button primary"
                disabled={bulk.isPending}
                onClick={() => {
                  try {
                    setImportError("");
                    bulk.mutate(parseImport(importText));
                  } catch (error) {
                    setImportError(String(error));
                  }
                }}
              >
                Import cases
              </button>
              <ErrorMessage error={bulk.error || importError} />
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
