import asyncio
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from app.core import get_settings


@dataclass(frozen=True)
class GenerationConfig:
    model_name: str
    settings: dict[str, Any]


@dataclass
class GenerationResult:
    content: str
    input_tokens: int | None
    output_tokens: int | None
    latency_ms: float
    estimated_cost: float | None
    provider_metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ModelPricing:
    input_cost_per_million: float
    output_cost_per_million: float

    def estimate(self, input_tokens: int | None, output_tokens: int | None) -> float | None:
        if input_tokens is None or output_tokens is None:
            return None
        return (
            input_tokens * self.input_cost_per_million
            + output_tokens * self.output_cost_per_million
        ) / 1_000_000


def configured_pricing(settings: dict[str, Any]) -> ModelPricing | None:
    if "input_cost_per_million" not in settings or "output_cost_per_million" not in settings:
        return None
    return ModelPricing(settings["input_cost_per_million"], settings["output_cost_per_million"])


class LLMProvider(ABC):
    @abstractmethod
    async def generate(self, prompt: str, config: GenerationConfig) -> GenerationResult:
        raise NotImplementedError


class MockProvider(LLMProvider):
    async def generate(self, prompt: str, config: GenerationConfig) -> GenerationResult:
        started = time.perf_counter()
        settings = config.settings
        await asyncio.sleep(settings.get("mock_delay_ms", 0) / 1000)
        if prompt in settings.get("mock_error_inputs", []):
            raise ValueError("Configured mock failure")
        content = settings.get("mock_responses", {}).get(
            prompt, settings.get("mock_response", prompt)
        )
        if not isinstance(content, str):
            raise ValueError("Mock response must be a string")
        input_tokens = len(prompt.split())
        output_tokens = len(content.split())
        pricing = configured_pricing(settings)
        return GenerationResult(
            content,
            input_tokens,
            output_tokens,
            (time.perf_counter() - started) * 1000,
            pricing.estimate(input_tokens, output_tokens) if pricing else None,
            {"token_count_method": "whitespace_estimate", "model": config.model_name},
        )


class OpenAIProvider(LLMProvider):
    async def generate(self, prompt: str, config: GenerationConfig) -> GenerationResult:
        from openai import AsyncOpenAI

        started = time.perf_counter()
        kwargs: dict[str, Any] = {}
        if "temperature" in config.settings:
            kwargs["temperature"] = config.settings["temperature"]
        if "max_tokens" in config.settings:
            kwargs["max_tokens"] = config.settings["max_tokens"]
        async with AsyncOpenAI(api_key=get_settings().openai_api_key) as client:
            response = await client.chat.completions.create(
                model=config.model_name,
                messages=[{"role": "user", "content": prompt}],
                **kwargs,
            )
        usage = response.usage
        input_tokens = usage.prompt_tokens if usage else None
        output_tokens = usage.completion_tokens if usage else None
        pricing = configured_pricing(config.settings)
        return GenerationResult(
            response.choices[0].message.content or "",
            input_tokens,
            output_tokens,
            (time.perf_counter() - started) * 1000,
            pricing.estimate(input_tokens, output_tokens) if pricing else None,
            {"model": response.model, "finish_reason": response.choices[0].finish_reason},
        )


class AnthropicProvider(LLMProvider):
    async def generate(self, prompt: str, config: GenerationConfig) -> GenerationResult:
        from anthropic import AsyncAnthropic

        started = time.perf_counter()
        kwargs = {}
        if "temperature" in config.settings:
            kwargs["temperature"] = config.settings["temperature"]
        async with AsyncAnthropic(api_key=get_settings().anthropic_api_key) as client:
            response = await client.messages.create(
                model=config.model_name,
                max_tokens=config.settings.get("max_tokens", 1024),
                messages=[{"role": "user", "content": prompt}],
                **kwargs,
            )
        content = "".join(block.text for block in response.content if block.type == "text")
        input_tokens, output_tokens = response.usage.input_tokens, response.usage.output_tokens
        pricing = configured_pricing(config.settings)
        return GenerationResult(
            content,
            input_tokens,
            output_tokens,
            (time.perf_counter() - started) * 1000,
            pricing.estimate(input_tokens, output_tokens) if pricing else None,
            {"model": response.model, "stop_reason": response.stop_reason},
        )


PROVIDERS: dict[str, LLMProvider] = {
    "mock": MockProvider(),
    "openai": OpenAIProvider(),
    "anthropic": AnthropicProvider(),
}


def credential_available(provider_type: str) -> bool:
    settings = get_settings()
    return provider_type == "mock" or bool(
        {
            "openai": settings.openai_api_key,
            "anthropic": settings.anthropic_api_key,
        }.get(provider_type)
    )
