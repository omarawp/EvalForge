import json
from typing import Any

from fastapi import HTTPException
from jsonschema import Draft202012Validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import queue
from app.evaluators import validate_spec
from app.metrics import compare_runs, run_metrics
from app.models import (
    Dataset,
    EvaluationResult,
    EvaluationRun,
    Prompt,
    PromptVersion,
    ProviderConfiguration,
    TestCase,
    now,
)
from app.providers import credential_available
from app.schemas import (
    DatasetCreate,
    DatasetDetail,
    DatasetRead,
    PromptCreate,
    PromptRead,
    ProviderCreate,
    ProviderRead,
    RunCreate,
    RunRead,
    TestCaseCreate,
)
from app.templating import render_prompt


def require(db: Session, model: type, identifier: str):
    obj = db.get(model, identifier)
    if obj is None:
        raise HTTPException(404, "Resource not found")
    return obj


def commit_unique(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, "Name already exists or resource is in use") from exc


def dataset_read(dataset: Dataset) -> DatasetRead:
    return DatasetRead.model_validate(dataset).model_copy(
        update={"test_case_count": len(dataset.test_cases)}
    )


def dataset_detail(dataset: Dataset) -> DatasetDetail:
    data = DatasetDetail.model_validate(dataset)
    data.test_case_count = len(dataset.test_cases)
    return data


def create_dataset(db: Session, payload: DatasetCreate) -> DatasetDetail:
    dataset = Dataset(**payload.model_dump())
    db.add(dataset)
    commit_unique(db)
    db.refresh(dataset)
    return dataset_detail(dataset)


def validate_case(case: TestCaseCreate) -> None:
    if len(json.dumps(case.model_dump(), ensure_ascii=False)) > 20_000:
        raise HTTPException(413, "Test case exceeds 20 KB")
    schema = case.metadata.get("json_schema")
    if schema is not None:
        try:
            Draft202012Validator.check_schema(schema)
        except Exception as exc:
            raise HTTPException(422, f"Invalid JSON schema: {str(exc)[:200]}") from exc


def add_cases(db: Session, dataset_id: str, cases: list[TestCaseCreate]) -> DatasetDetail:
    dataset = require(db, Dataset, dataset_id)
    if not cases or len(cases) > 500:
        raise HTTPException(422, "Import must contain 1 to 500 cases")
    if len(dataset.test_cases) + len(cases) > 5000:
        raise HTTPException(422, "Dataset limit is 5000 cases")
    for case in cases:
        validate_case(case)
        db.add(
            TestCase(
                dataset_id=dataset_id,
                input=case.input,
                expected_output=case.expected_output,
                case_metadata=case.metadata,
            )
        )
    db.commit()
    db.refresh(dataset)
    db.expire(dataset, ["test_cases"])
    return dataset_detail(dataset)


def create_prompt(db: Session, payload: PromptCreate) -> PromptRead:
    prompt = Prompt(name=payload.name, description=payload.description)
    prompt.versions = [PromptVersion(version=1, template=payload.template)]
    db.add(prompt)
    commit_unique(db)
    db.refresh(prompt)
    return PromptRead.model_validate(prompt)


def add_prompt_version(db: Session, prompt_id: str, template: str) -> PromptRead:
    prompt = require(db, Prompt, prompt_id)
    latest = (
        db.scalar(
            select(func.max(PromptVersion.version)).where(PromptVersion.prompt_id == prompt_id)
        )
        or 0
    )
    db.add(PromptVersion(prompt_id=prompt_id, version=latest + 1, template=template))
    prompt.updated_at = now()
    commit_unique(db)
    db.refresh(prompt)
    db.expire(prompt, ["versions"])
    return PromptRead.model_validate(prompt)


def provider_read(provider: ProviderConfiguration) -> ProviderRead:
    return ProviderRead.model_validate(provider).model_copy(
        update={"credential_available": credential_available(provider.provider_type)}
    )


def create_provider(db: Session, payload: ProviderCreate) -> ProviderRead:
    provider = ProviderConfiguration(**payload.model_dump())
    db.add(provider)
    commit_unique(db)
    db.refresh(provider)
    return provider_read(provider)


def _load_results(db: Session, run_id: str) -> list[EvaluationResult]:
    return list(
        db.scalars(
            select(EvaluationResult)
            .options(selectinload(EvaluationResult.scores))
            .where(EvaluationResult.run_id == run_id)
            .order_by(EvaluationResult.created_at, EvaluationResult.id)
        )
    )


def run_read(db: Session, run: EvaluationRun) -> RunRead:
    results = _load_results(db, run.id)
    return RunRead.model_validate(run).model_copy(
        update={
            "result_count": len(results),
            "total_cases": run.total_cases,
            "metrics": run_metrics(results) if results else None,
        }
    )


def create_run(db: Session, payload: RunCreate) -> RunRead:
    dataset = require(db, Dataset, payload.dataset_id)
    version = require(db, PromptVersion, payload.prompt_version_id)
    provider = require(db, ProviderConfiguration, payload.provider_configuration_id)
    if not dataset.test_cases:
        raise HTTPException(422, "Dataset has no test cases")
    if not credential_available(provider.provider_type):
        raise HTTPException(422, f"{provider.provider_type} credential is not configured")
    if len({spec.type for spec in payload.evaluators}) != len(payload.evaluators):
        raise HTTPException(422, "Evaluator types must be unique")
    for spec in payload.evaluators:
        try:
            validate_spec(spec.type, spec.config)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
    if any(spec.type == "json_schema" for spec in payload.evaluators):
        missing = [
            case.id for case in dataset.test_cases if "json_schema" not in case.case_metadata
        ]
        if missing:
            raise HTTPException(422, f"Test case {missing[0]} is missing metadata.json_schema")
    if any(spec.type in {"contains", "semantic_similarity"} for spec in payload.evaluators):
        invalid = [
            case.id for case in dataset.test_cases if not isinstance(case.expected_output, str)
        ]
        if invalid:
            raise HTTPException(422, f"Test case {invalid[0]} needs a string expected output")
    for case in dataset.test_cases:
        try:
            render_prompt(version.template, case.input, case.case_metadata)
        except ValueError as exc:
            raise HTTPException(422, f"Test case {case.id}: {exc}") from exc
    run = EvaluationRun(
        name=payload.name,
        dataset_id=dataset.id,
        prompt_version_id=version.id,
        provider_configuration_id=provider.id,
        evaluator_specs=[spec.model_dump() for spec in payload.evaluators],
        case_ids=[case.id for case in dataset.test_cases],
        total_cases=len(dataset.test_cases),
        status="pending",
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    try:
        queue.enqueue_run(run.id)
    except Exception as exc:
        run.status = "failed"
        run.error = "Evaluation queue is unavailable"
        run.completed_at = now()
        db.commit()
        raise HTTPException(503, "Evaluation queue is unavailable") from exc
    return run_read(db, run)


def comparison(db: Session, run_a_id: str, run_b_id: str) -> dict[str, Any]:
    run_a = require(db, EvaluationRun, run_a_id)
    run_b = require(db, EvaluationRun, run_b_id)
    if run_a.status != "completed" or run_b.status != "completed":
        raise HTTPException(422, "Both runs must be completed")
    if run_a.dataset_id != run_b.dataset_id:
        raise HTTPException(422, "Runs must use the same dataset")
    if run_a.evaluator_specs != run_b.evaluator_specs:
        raise HTTPException(422, "Runs must use the same evaluator settings")
    return {
        "run_a_id": run_a.id,
        "run_b_id": run_b.id,
        **compare_runs(_load_results(db, run_a.id), _load_results(db, run_b.id)),
    }
