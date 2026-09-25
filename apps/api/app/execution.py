import asyncio
import time
from collections.abc import Callable
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import get_settings
from app.db import SessionLocal
from app.evaluators import EVALUATORS
from app.models import (
    EvaluationResult,
    EvaluationRun,
    EvaluationScore,
    PromptVersion,
    ProviderConfiguration,
    TestCase,
    now,
)
from app.providers import PROVIDERS, GenerationConfig
from app.templating import render_prompt


async def _execute_case(
    case: TestCase,
    template: str,
    provider_type: str,
    config: GenerationConfig,
    specs: list[dict[str, Any]],
    semaphore: asyncio.Semaphore,
) -> dict[str, Any]:
    async with semaphore:
        started = time.perf_counter()
        rendered: str | None = None
        try:
            rendered = render_prompt(template, case.input, case.case_metadata)
            generation = await PROVIDERS[provider_type].generate(rendered, config)
        except Exception as exc:
            message = (
                str(exc)[:300]
                if isinstance(exc, ValueError)
                else f"{type(exc).__name__} during generation"
            )
            return {
                "case_id": case.id,
                "rendered_prompt": rendered,
                "actual_output": None,
                "latency_ms": (time.perf_counter() - started) * 1000,
                "input_tokens": None,
                "output_tokens": None,
                "estimated_cost": None,
                "provider_metadata": {},
                "scores": [],
                "error": message,
            }
        scores = []
        evaluation_error = None
        for spec in specs:
            try:
                evaluator = EVALUATORS[spec["type"]]
                args = (
                    case.expected_output,
                    generation.content,
                    spec.get("config", {}),
                    case.case_metadata,
                )
                if (
                    spec["type"] == "semantic_similarity"
                    and spec.get("config", {}).get("method") == "local_embeddings"
                ):
                    score = await asyncio.to_thread(evaluator.evaluate, *args)
                else:
                    score = evaluator.evaluate(*args)
                scores.append((spec["type"], score.score, score.details))
            except Exception:
                evaluation_error = f"{spec['type']} evaluator could not score this result"
                scores = []
                break
        return {
            "case_id": case.id,
            "rendered_prompt": rendered,
            "actual_output": generation.content,
            "latency_ms": generation.latency_ms,
            "input_tokens": generation.input_tokens,
            "output_tokens": generation.output_tokens,
            "estimated_cost": generation.estimated_cost,
            "provider_metadata": generation.provider_metadata,
            "scores": scores,
            "error": evaluation_error,
        }


async def execute_run(run_id: str, session_factory: Callable[[], Session] = SessionLocal) -> None:
    with session_factory() as db:
        run = db.get(EvaluationRun, run_id)
        if run is None or run.status != "pending":
            return
        run.status = "running"
        run.started_at = now()
        db.commit()
        case_ids = run.case_ids
        prompt_version_id = run.prompt_version_id
        provider_id = run.provider_configuration_id
        specs = run.evaluator_specs

    try:
        with session_factory() as db:
            cases = list(
                db.scalars(
                    select(TestCase)
                    .where(TestCase.id.in_(case_ids))
                    .order_by(TestCase.created_at, TestCase.id)
                )
            )
            version = db.get(PromptVersion, prompt_version_id)
            provider = db.get(ProviderConfiguration, provider_id)
            if version is None or provider is None:
                raise RuntimeError("Run configuration no longer exists")
            template = version.template
            provider_type = provider.provider_type
            config = GenerationConfig(provider.model_name, provider.configuration)

        limit = max(1, min(get_settings().evalforge_max_concurrency, 100))
        semaphore = asyncio.Semaphore(limit)
        tasks = [
            _execute_case(case, template, provider_type, config, specs, semaphore) for case in cases
        ]
        for future in asyncio.as_completed(tasks):
            data = await future
            with session_factory() as db:
                run = db.get(EvaluationRun, run_id)
                if run is None or run.status == "cancelled":
                    return
                case = db.get(TestCase, data["case_id"])
                if case is None:
                    continue
                result = EvaluationResult(
                    run_id=run_id,
                    test_case_id=case.id,
                    input=case.input,
                    expected_output=case.expected_output,
                    rendered_prompt=data["rendered_prompt"],
                    actual_output=data["actual_output"],
                    latency_ms=data["latency_ms"],
                    input_tokens=data["input_tokens"],
                    output_tokens=data["output_tokens"],
                    estimated_cost=data["estimated_cost"],
                    provider_metadata=data["provider_metadata"],
                    error=data["error"],
                )
                result.scores = [
                    EvaluationScore(evaluator_type=kind, score=value, details=details)
                    for kind, value, details in data["scores"]
                ]
                db.add(result)
                db.commit()
        with session_factory() as db:
            run = db.get(EvaluationRun, run_id)
            if run and run.status == "running":
                run.status = "completed"
                run.completed_at = now()
                db.commit()
    except Exception:
        with session_factory() as db:
            run = db.get(EvaluationRun, run_id)
            if run and run.status != "cancelled":
                run.status = "failed"
                run.error = "Worker could not complete the run. Check worker logs."
                run.completed_at = now()
                db.commit()
        raise


def run_evaluation(run_id: str) -> None:
    asyncio.run(execute_run(run_id))
