export type TestCase = {
  id: string;
  dataset_id: string;
  input: unknown;
  expected_output: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
};
export type Dataset = {
  id: string;
  name: string;
  description: string;
  test_case_count: number;
  test_cases?: TestCase[];
  created_at: string;
};
export type PromptVersion = {
  id: string;
  prompt_id: string;
  version: number;
  template: string;
  created_at: string;
};
export type Prompt = {
  id: string;
  name: string;
  description: string;
  versions: PromptVersion[];
  created_at: string;
};
export type Provider = {
  id: string;
  name: string;
  provider_type: "mock" | "openai" | "anthropic";
  model_name: string;
  configuration: Record<string, unknown>;
  credential_available: boolean;
  created_at: string;
};
export type Summary = {
  mean: number | null;
  median: number | null;
  p50: number | null;
  p95: number | null;
  min: number | null;
  max: number | null;
};
export type Metrics = {
  result_count: number;
  scored_count: number;
  average_score: number | null;
  pass_rate: number | null;
  scores: Summary;
  latency_ms: Summary;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number | null;
  failed_requests: number;
  evaluator_errors: number;
};
export type Run = {
  id: string;
  name: string;
  dataset_id: string;
  prompt_version_id: string;
  provider_configuration_id: string;
  evaluator_specs: { type: string; config: Record<string, unknown> }[];
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  error: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  result_count: number;
  total_cases: number;
  metrics: Metrics | null;
};
export type Score = {
  id: string;
  evaluator_type: string;
  score: number;
  details: Record<string, unknown>;
};
export type Result = {
  id: string;
  run_id: string;
  test_case_id: string;
  input: unknown;
  expected_output: unknown;
  rendered_prompt: string | null;
  actual_output: unknown;
  latency_ms: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  provider_metadata: Record<string, unknown>;
  error: string | null;
  scores: Score[];
};
export type Change = {
  test_case_id: string;
  input: unknown;
  previous: number;
  current: number;
  delta: number;
};
export type Comparison = {
  run_a_id: string;
  run_b_id: string;
  run_a: Metrics;
  run_b: Metrics;
  deltas: Record<string, number | null>;
  regressions: Change[];
  improvements: Change[];
};
export type Dashboard = {
  datasets: number;
  runs: number;
  test_cases: number;
  average_score: number | null;
  recent_runs: Run[];
};
