import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { api, json } from "../api";
import type { Provider } from "../types";
import { Empty, ErrorMessage, Loading, PageHeader, Panel } from "../ui";

export default function ProvidersPage() {
  const client = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [providerType, setProviderType] =
    useState<Provider["provider_type"]>("mock");
  const [modelName, setModelName] = useState("mock-v1");
  const [mockResponse, setMockResponse] = useState("");
  const [temperature, setTemperature] = useState("");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [advanced, setAdvanced] = useState("{}");
  const [formError, setFormError] = useState("");
  const query = useQuery({
    queryKey: ["providers"],
    queryFn: () => api<Provider[]>("/providers"),
  });
  const create = useMutation({
    mutationFn: (body: unknown) =>
      api<Provider>("/providers", json("POST", body)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["providers"] });
      setShowForm(false);
      setName("");
      setFormError("");
    },
  });
  const submit = () => {
    try {
      const extra = JSON.parse(advanced);
      if (!extra || typeof extra !== "object" || Array.isArray(extra))
        throw new Error("Advanced configuration must be a JSON object.");
      const configuration: Record<string, unknown> = { ...extra };
      if (providerType === "mock") {
        if (mockResponse) configuration.mock_response = mockResponse;
      } else if (temperature !== "")
        configuration.temperature = Number(temperature);
      if (inputPrice) configuration.input_cost_per_million = Number(inputPrice);
      if (outputPrice)
        configuration.output_cost_per_million = Number(outputPrice);
      setFormError("");
      create.mutate({
        name,
        provider_type: providerType,
        model_name: modelName,
        configuration,
      });
    } catch (error) {
      setFormError(String(error));
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="MODEL ACCESS"
        title="Providers"
        description="Configure models here. Real provider credentials are read from environment variables and never stored in the database."
        action={
          <button
            className="button primary"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus size={16} /> Add provider
          </button>
        }
      />
      {showForm && (
        <Panel title="Configure a provider" className="form-panel">
          <form
            className="form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="form-grid">
              <label>
                Configuration name
                <input
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Mock baseline"
                />
              </label>
              <label>
                Provider
                <select
                  value={providerType}
                  onChange={(event) => {
                    const value = event.target
                      .value as Provider["provider_type"];
                    setProviderType(value);
                    setModelName(value === "mock" ? "mock-v1" : "");
                  }}
                >
                  <option value="mock">Mock</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                </select>
              </label>
              <label>
                Model name
                <input
                  required
                  value={modelName}
                  onChange={(event) => setModelName(event.target.value)}
                  placeholder="Model identifier"
                />
              </label>
              {providerType === "mock" ? (
                <label>
                  Default mock response
                  <input
                    value={mockResponse}
                    onChange={(event) => setMockResponse(event.target.value)}
                    placeholder="Leave empty to echo rendered prompt"
                  />
                </label>
              ) : (
                <label>
                  Temperature <span className="hint">optional</span>
                  <input
                    type="number"
                    min="0"
                    max="2"
                    step="0.1"
                    value={temperature}
                    onChange={(event) => setTemperature(event.target.value)}
                    placeholder="Model default"
                  />
                </label>
              )}
              <label>
                Input price / 1M tokens <span className="hint">optional</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={inputPrice}
                  onChange={(event) => setInputPrice(event.target.value)}
                />
              </label>
              <label>
                Output price / 1M tokens <span className="hint">optional</span>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={outputPrice}
                  onChange={(event) => setOutputPrice(event.target.value)}
                />
              </label>
            </div>
            <label>
              Advanced configuration JSON{" "}
              <span className="hint">
                optional; mock_responses maps full rendered prompts to responses
              </span>
              <textarea
                value={advanced}
                onChange={(event) => setAdvanced(event.target.value)}
                rows={3}
              />
            </label>
            <button className="button primary" disabled={create.isPending}>
              Save provider
            </button>
            <ErrorMessage error={create.error || formError} />
          </form>
        </Panel>
      )}
      <Panel
        title="Configured models"
        action={
          <span className="count">
            {query.data?.length ?? 0} configurations
          </span>
        }
      >
        {query.isLoading ? (
          <Loading />
        ) : query.error ? (
          <ErrorMessage error={query.error} />
        ) : query.data?.length ? (
          <div className="provider-grid">
            {query.data.map((provider) => (
              <div className="provider-card" key={provider.id}>
                <div className="provider-letter">
                  {provider.provider_type[0].toUpperCase()}
                </div>
                <div>
                  <div className="provider-name">{provider.name}</div>
                  <div className="muted">
                    {provider.provider_type} / {provider.model_name}
                  </div>
                  <span
                    className={
                      provider.credential_available
                        ? "availability available"
                        : "availability"
                    }
                  >
                    {provider.credential_available
                      ? "Ready to run"
                      : "API key missing"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="No providers configured"
            body="Add a Mock provider to run evaluations without an API key."
          />
        )}
      </Panel>
    </>
  );
}
