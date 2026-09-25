import json
import math
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class DatasetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=5000)


class TestCaseCreate(BaseModel):
    input: Any
    expected_output: Any = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class TestCaseRead(ORMModel):
    id: str
    dataset_id: str
    input: Any
    expected_output: Any
    metadata: dict[str, Any] = Field(validation_alias="case_metadata")
    created_at: datetime


class DatasetRead(ORMModel):
    id: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    test_case_count: int = 0


class DatasetDetail(DatasetRead):
    test_cases: list[TestCaseRead]


class PromptCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=5000)
    template: str = Field(min_length=1, max_length=20000)


class PromptVersionCreate(BaseModel):
    template: str = Field(min_length=1, max_length=20000)


class PromptVersionRead(ORMModel):
    id: str
    prompt_id: str
    version: int
    template: str
    created_at: datetime


class PromptRead(ORMModel):
    id: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    versions: list[PromptVersionRead]


class PromptPreview(BaseModel):
    input: Any
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProviderCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    provider_type: Literal["mock", "openai", "anthropic"]
    model_name: str = Field(min_length=1, max_length=160)
    configuration: dict[str, Any] = Field(default_factory=dict)

    @field_validator("configuration")
    @classmethod
    def validate_configuration(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value, ensure_ascii=False)) > 100_000:
            raise ValueError("Provider configuration exceeds 100 KB")
        allowed = {
            "temperature",
            "max_tokens",
            "input_cost_per_million",
            "output_cost_per_million",
            "mock_response",
            "mock_responses",
            "mock_delay_ms",
            "mock_error_inputs",
        }
        if set(value) - allowed:
            raise ValueError(
                f"Unsupported configuration keys: {', '.join(sorted(set(value) - allowed))}"
            )
        for key in (
            "temperature",
            "input_cost_per_million",
            "output_cost_per_million",
            "mock_delay_ms",
        ):
            if key in value and (
                isinstance(value[key], bool)
                or not isinstance(value[key], (int, float))
                or value[key] < 0
                or value[key] > 1_000_000_000
                or not math.isfinite(value[key])
            ):
                raise ValueError(f"{key} must be a non-negative number")
        if "max_tokens" in value and (
            isinstance(value["max_tokens"], bool)
            or not isinstance(value["max_tokens"], int)
            or value["max_tokens"] < 1
        ):
            raise ValueError("max_tokens must be a positive integer")
        if "mock_responses" in value and not isinstance(value["mock_responses"], dict):
            raise ValueError("mock_responses must be an object")
        if "mock_responses" in value and any(
            not isinstance(key, str) or not isinstance(response, str)
            for key, response in value["mock_responses"].items()
        ):
            raise ValueError("mock_responses must map strings to strings")
        if "mock_response" in value and not isinstance(value["mock_response"], str):
            raise ValueError("mock_response must be a string")
        if "mock_error_inputs" in value and not isinstance(value["mock_error_inputs"], list):
            raise ValueError("mock_error_inputs must be an array")
        if "mock_error_inputs" in value and any(
            not isinstance(item, str) for item in value["mock_error_inputs"]
        ):
            raise ValueError("mock_error_inputs must contain strings")
        return value

    @model_validator(mode="after")
    def validate_provider_settings(self):
        mock_keys = {"mock_response", "mock_responses", "mock_delay_ms", "mock_error_inputs"}
        if self.provider_type == "mock" and set(self.configuration) & {"temperature", "max_tokens"}:
            raise ValueError("Mock provider does not use temperature or max_tokens")
        if self.provider_type != "mock" and set(self.configuration) & mock_keys:
            raise ValueError("Mock settings are only valid for Mock providers")
        if self.provider_type == "anthropic" and self.configuration.get("temperature", 0) > 1:
            raise ValueError("Anthropic temperature must be at most 1")
        if self.provider_type == "openai" and self.configuration.get("temperature", 0) > 2:
            raise ValueError("OpenAI temperature must be at most 2")
        if self.provider_type == "mock" and self.configuration.get("mock_delay_ms", 0) > 30_000:
            raise ValueError("Mock delay must be at most 30000 ms")
        return self


class ProviderRead(ORMModel):
    id: str
    name: str
    provider_type: str
    model_name: str
    configuration: dict[str, Any]
    created_at: datetime
    credential_available: bool = False


class EvaluatorSpec(BaseModel):
    type: Literal["exact_match", "contains", "json_validity", "json_schema", "semantic_similarity"]
    config: dict[str, Any] = Field(default_factory=dict)


class RunCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    dataset_id: str
    prompt_version_id: str
    provider_configuration_id: str
    evaluators: list[EvaluatorSpec] = Field(min_length=1, max_length=5)


class ScoreRead(ORMModel):
    id: str
    evaluator_type: str
    score: float
    details: dict[str, Any]


class ResultRead(ORMModel):
    id: str
    run_id: str
    test_case_id: str
    input: Any
    expected_output: Any
    rendered_prompt: str | None
    actual_output: Any | None
    latency_ms: float | None
    input_tokens: int | None
    output_tokens: int | None
    estimated_cost: float | None
    provider_metadata: dict[str, Any]
    error: str | None
    scores: list[ScoreRead]


class RunRead(ORMModel):
    id: str
    name: str
    dataset_id: str
    prompt_version_id: str
    provider_configuration_id: str
    evaluator_specs: list[dict[str, Any]]
    status: str
    error: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    result_count: int = 0
    total_cases: int = 0
    metrics: dict[str, Any] | None = None
