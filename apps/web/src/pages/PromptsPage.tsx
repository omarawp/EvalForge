import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, json } from "../api";
import type { Prompt, PromptVersion } from "../types";
import { date, Empty, ErrorMessage, Loading, PageHeader, Panel } from "../ui";

export default function PromptsPage() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState(
    "Answer the following question concisely:\n\n{{input}}",
  );
  const [selectedId, setSelectedId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [newVersion, setNewVersion] = useState("");
  const [sample, setSample] = useState("What is the capital of Canada?");
  const [preview, setPreview] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const query = useQuery({
    queryKey: ["prompts"],
    queryFn: () => api<Prompt[]>("/prompts"),
  });
  const prompts = query.data ?? [];
  const selected =
    prompts.find((prompt) => prompt.id === selectedId) ?? prompts[0];
  const version =
    selected?.versions.find((item) => item.id === selectedVersionId) ??
    [...(selected?.versions ?? [])].sort((a, b) => b.version - a.version)[0];
  const refresh = () => client.invalidateQueries({ queryKey: ["prompts"] });
  const create = useMutation({
    mutationFn: () =>
      api<Prompt>("/prompts", json("POST", { name, description, template })),
    onSuccess: (prompt) => {
      refresh();
      setSelectedId(prompt.id);
      setShowCreate(false);
      setName("");
      setDescription("");
    },
  });
  const addVersion = useMutation({
    mutationFn: () =>
      api<Prompt>(
        `/prompts/${selected?.id}/versions`,
        json("POST", { template: newVersion }),
      ),
    onSuccess: (prompt) => {
      refresh();
      setSelectedVersionId(
        prompt.versions.sort((a, b) => b.version - a.version)[0].id,
      );
      setNewVersion("");
    },
  });
  const doPreview = useMutation({
    mutationFn: (selectedVersion: PromptVersion) =>
      api<{ rendered_prompt: string }>(
        `/prompt-versions/${selectedVersion.id}/preview`,
        json("POST", { input: sample }),
      ),
    onSuccess: (data) => setPreview(data.rendered_prompt),
  });
  return (
    <>
      <PageHeader
        eyebrow="PROMPT LIBRARY"
        title="Prompts & versions"
        description="Every edit creates a new immutable version, so experiments remain reproducible."
        action={
          <button
            className="button primary"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus size={16} /> New prompt
          </button>
        }
      />
      {showCreate && (
        <Panel title="Create a prompt" className="form-panel">
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <div className="form-grid">
              <label>
                Name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Concise QA"
                />
              </label>
              <label>
                Description
                <input
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Short factual answers"
                />
              </label>
            </div>
            <label>
              Template
              <textarea
                required
                value={template}
                onChange={(event) => setTemplate(event.target.value)}
                rows={5}
              />
            </label>
            <p className="help">
              Use <code>{"{{input}}"}</code> or keys in an object input, such as{" "}
              <code>{"{{customer.name}}"}</code>.
            </p>
            <button className="button primary" disabled={create.isPending}>
              Create prompt
            </button>
            <ErrorMessage error={create.error} />
          </form>
        </Panel>
      )}
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorMessage error={query.error} />
      ) : !selected ? (
        <Panel>
          <Empty
            title="No prompts yet"
            body="Create your first template to begin a versioned evaluation."
          />
        </Panel>
      ) : (
        <div className="library-grid">
          <Panel title="Prompt library">
            <div className="list-select">
              {prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  className={selected.id === prompt.id ? "selected" : ""}
                  onClick={() => {
                    setSelectedId(prompt.id);
                    setSelectedVersionId("");
                    setPreview("");
                  }}
                >
                  <strong>{prompt.name}</strong>
                  <span>
                    {prompt.versions.length} version
                    {prompt.versions.length === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
          </Panel>
          <div className="library-main">
            <Panel
              title={selected.name}
              action={
                <span className="count">
                  Created {date(selected.created_at)}
                </span>
              }
            >
              <p className="muted">
                {selected.description || "No description"}
              </p>
              <div className="version-bar">
                <label>
                  Version
                  <select
                    value={version?.id ?? ""}
                    onChange={(event) => {
                      setSelectedVersionId(event.target.value);
                      setPreview("");
                    }}
                  >
                    {[...selected.versions]
                      .sort((a, b) => b.version - a.version)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          v{item.version} · {date(item.created_at)}
                        </option>
                      ))}
                  </select>
                </label>
                <span className="immutable">IMMUTABLE</span>
              </div>
              <pre className="code-block">{version?.template}</pre>
            </Panel>
            <Panel title="Preview rendered prompt">
              <div className="form-stack">
                <label>
                  Sample input
                  <input
                    value={sample}
                    onChange={(event) => setSample(event.target.value)}
                  />
                </label>
                <button
                  className="button"
                  disabled={!version || doPreview.isPending}
                  onClick={() => version && doPreview.mutate(version)}
                >
                  Render preview
                </button>
                <ErrorMessage error={doPreview.error} />
                {preview && <pre className="code-block preview">{preview}</pre>}
              </div>
            </Panel>
            <Panel title="Create next version">
              <form
                className="form-stack"
                onSubmit={(event) => {
                  event.preventDefault();
                  addVersion.mutate();
                }}
              >
                <label>
                  New template
                  <textarea
                    required
                    value={newVersion}
                    onChange={(event) => setNewVersion(event.target.value)}
                    placeholder={version?.template}
                    rows={5}
                  />
                </label>
                <button
                  className="button primary"
                  disabled={addVersion.isPending}
                >
                  Save as v
                  {Math.max(...selected.versions.map((v) => v.version)) + 1}
                </button>
                <ErrorMessage error={addVersion.error} />
              </form>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
