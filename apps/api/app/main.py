from typing import Annotated, Any

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db import get_db
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
from app.schemas import (
    DatasetCreate,
    DatasetDetail,
    DatasetRead,
    PromptCreate,
    PromptPreview,
    PromptRead,
    PromptVersionCreate,
    ProviderCreate,
    ProviderRead,
    ResultRead,
    RunCreate,
    RunRead,
    TestCaseCreate,
)
from app.services import (
    _load_results,
    add_cases,
    add_prompt_version,
    comparison,
    create_dataset,
    create_prompt,
    create_provider,
    create_run,
    dataset_detail,
    dataset_read,
    provider_read,
    require,
    run_read,
)
from app.templating import render_prompt

app = FastAPI(title="EvalForge API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
DB = Annotated[Session, Depends(get_db)]


@app.get("/health")
def health(db: DB) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


@app.get("/dashboard")
def dashboard(db: DB) -> dict[str, Any]:
    runs = list(
        db.scalars(select(EvaluationRun).order_by(EvaluationRun.created_at.desc()).limit(5))
    )
    completed = list(db.scalars(select(EvaluationRun).where(EvaluationRun.status == "completed")))
    scores = [run_read(db, run).metrics["average_score"] for run in completed]
    scores = [score for score in scores if score is not None]
    return {
        "datasets": db.scalar(select(func.count()).select_from(Dataset)),
        "runs": db.scalar(select(func.count()).select_from(EvaluationRun)),
        "test_cases": db.scalar(select(func.count()).select_from(TestCase)),
        "average_score": sum(scores) / len(scores) if scores else None,
        "recent_runs": [run_read(db, run) for run in runs],
    }


@app.get("/datasets", response_model=list[DatasetRead])
def list_datasets(db: DB):
    return [
        dataset_read(d)
        for d in db.scalars(
            select(Dataset)
            .options(selectinload(Dataset.test_cases))
            .order_by(Dataset.created_at.desc())
        )
    ]


@app.post("/datasets", response_model=DatasetDetail, status_code=201)
def post_dataset(payload: DatasetCreate, db: DB):
    return create_dataset(db, payload)


@app.get("/datasets/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: str, db: DB):
    return dataset_detail(require(db, Dataset, dataset_id))


@app.delete("/datasets/{dataset_id}", status_code=204)
def delete_dataset(dataset_id: str, db: DB):
    dataset = require(db, Dataset, dataset_id)
    if db.scalar(
        select(func.count())
        .select_from(EvaluationRun)
        .where(EvaluationRun.dataset_id == dataset_id)
    ):
        raise HTTPException(409, "Dataset has evaluation runs")
    db.delete(dataset)
    db.commit()
    return Response(status_code=204)


@app.post("/datasets/{dataset_id}/test-cases", response_model=DatasetDetail, status_code=201)
def post_case(dataset_id: str, payload: TestCaseCreate, db: DB):
    return add_cases(db, dataset_id, [payload])


@app.post("/datasets/{dataset_id}/import", response_model=DatasetDetail, status_code=201)
def import_cases(dataset_id: str, payload: list[TestCaseCreate], db: DB):
    return add_cases(db, dataset_id, payload)


@app.delete("/test-cases/{case_id}", status_code=204)
def delete_case(case_id: str, db: DB):
    case = require(db, TestCase, case_id)
    runs = db.scalars(select(EvaluationRun).where(EvaluationRun.dataset_id == case.dataset_id))
    if any(case_id in run.case_ids for run in runs):
        raise HTTPException(409, "Test case is used by an evaluation run")
    if db.scalar(
        select(func.count())
        .select_from(EvaluationResult)
        .where(EvaluationResult.test_case_id == case_id)
    ):
        raise HTTPException(409, "Test case has evaluation results")
    db.delete(case)
    db.commit()
    return Response(status_code=204)


@app.get("/prompts", response_model=list[PromptRead])
def list_prompts(db: DB):
    return list(
        db.scalars(
            select(Prompt).options(selectinload(Prompt.versions)).order_by(Prompt.created_at.desc())
        )
    )


@app.post("/prompts", response_model=PromptRead, status_code=201)
def post_prompt(payload: PromptCreate, db: DB):
    return create_prompt(db, payload)


@app.get("/prompts/{prompt_id}", response_model=PromptRead)
def get_prompt(prompt_id: str, db: DB):
    return require(db, Prompt, prompt_id)


@app.post("/prompts/{prompt_id}/versions", response_model=PromptRead, status_code=201)
def post_version(prompt_id: str, payload: PromptVersionCreate, db: DB):
    return add_prompt_version(db, prompt_id, payload.template)


@app.post("/prompt-versions/{version_id}/preview")
def preview(version_id: str, payload: PromptPreview, db: DB):
    version = require(db, PromptVersion, version_id)
    try:
        return {"rendered_prompt": render_prompt(version.template, payload.input, payload.metadata)}
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/providers", response_model=list[ProviderRead])
def list_providers(db: DB):
    return [
        provider_read(p)
        for p in db.scalars(
            select(ProviderConfiguration).order_by(ProviderConfiguration.created_at.desc())
        )
    ]


@app.post("/providers", response_model=ProviderRead, status_code=201)
def post_provider(payload: ProviderCreate, db: DB):
    return create_provider(db, payload)


@app.get("/runs", response_model=list[RunRead])
def list_runs(db: DB):
    return [
        run_read(db, r)
        for r in db.scalars(select(EvaluationRun).order_by(EvaluationRun.created_at.desc()))
    ]


@app.post("/runs", response_model=RunRead, status_code=202)
def post_run(payload: RunCreate, db: DB):
    return create_run(db, payload)


@app.get("/runs/{run_id}", response_model=RunRead)
def get_run(run_id: str, db: DB):
    return run_read(db, require(db, EvaluationRun, run_id))


@app.get("/runs/{run_id}/results", response_model=list[ResultRead])
def get_results(run_id: str, db: DB):
    require(db, EvaluationRun, run_id)
    return _load_results(db, run_id)


@app.post("/runs/{run_id}/cancel", response_model=RunRead)
def cancel_run(run_id: str, db: DB):
    run = require(db, EvaluationRun, run_id)
    if run.status not in ("pending", "running"):
        raise HTTPException(409, "Run is already finished")
    run.status = "cancelled"
    run.completed_at = now()
    db.commit()
    return run_read(db, run)


@app.get("/comparisons")
def get_comparison(db: DB, run_a: str = Query(), run_b: str = Query()):
    return comparison(db, run_a, run_b)
