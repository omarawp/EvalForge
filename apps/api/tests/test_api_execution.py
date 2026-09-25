import asyncio
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.execution import execute_run
from app.models import EvaluationRun
from app.providers import GenerationConfig, GenerationResult, MockProvider


def setup_resources(client: TestClient, response: str = "Ottawa") -> tuple[str, str, str]:
    dataset = client.post(
        "/datasets", json={"name": "Capital QA", "description": "Geography"}
    ).json()
    assert (
        client.post(
            f"/datasets/{dataset['id']}/test-cases",
            json={"input": "Canada", "expected_output": "Ottawa"},
        ).status_code
        == 201
    )
    prompt = client.post(
        "/prompts", json={"name": "Capital prompt", "template": "Capital of {{input}}?"}
    ).json()
    provider = client.post(
        "/providers",
        json={
            "name": "Mock baseline",
            "provider_type": "mock",
            "model_name": "mock-v1",
            "configuration": {"mock_response": response},
        },
    ).json()
    return dataset["id"], prompt["versions"][0]["id"], provider["id"]


def test_dataset_crud_and_bulk_import(client: TestClient):
    dataset = client.post("/datasets", json={"name": "Sample"}).json()
    assert client.get("/datasets").json()[0]["test_case_count"] == 0
    result = client.post(
        f"/datasets/{dataset['id']}/import",
        json=[
            {"input": {"text": "hi"}, "expected_output": {"label": "greeting"}},
            {"input": "2+2", "expected_output": "4"},
        ],
    )
    assert result.status_code == 201
    assert result.json()["test_case_count"] == 2
    case_id = result.json()["test_cases"][0]["id"]
    assert client.delete(f"/test-cases/{case_id}").status_code == 204
    assert client.get(f"/datasets/{dataset['id']}").json()["test_case_count"] == 1
    assert client.delete(f"/datasets/{dataset['id']}").status_code == 204
    assert client.get(f"/datasets/{dataset['id']}").status_code == 404


def test_prompt_versions_are_immutable(client: TestClient):
    prompt = client.post("/prompts", json={"name": "P", "template": "First {{input}}"}).json()
    updated = client.post(
        f"/prompts/{prompt['id']}/versions", json={"template": "Second {{input}}"}
    ).json()
    assert len(updated["versions"]) == 2
    assert {v["version"]: v["template"] for v in updated["versions"]} == {
        1: "First {{input}}",
        2: "Second {{input}}",
    }
    version = prompt["versions"][0]
    assert (
        client.post(f"/prompt-versions/{version['id']}/preview", json={"input": "Canada"}).json()[
            "rendered_prompt"
        ]
        == "First Canada"
    )


def test_provider_configuration_rejects_secrets(client: TestClient):
    response = client.post(
        "/providers",
        json={
            "name": "unsafe",
            "provider_type": "openai",
            "model_name": "any",
            "configuration": {"api_key": "secret"},
        },
    )
    assert response.status_code == 422
    response = client.post(
        "/providers", json={"name": "remote", "provider_type": "openai", "model_name": "any"}
    )
    assert response.status_code == 201
    assert response.json()["credential_available"] is False


def test_run_creation_execution_and_comparison(
    client: TestClient, session_factory: sessionmaker[Session], monkeypatch
):
    enqueued = []
    monkeypatch.setattr("app.queue.enqueue_run", enqueued.append)
    dataset_id, version_id, provider_id = setup_resources(client)
    payload = {
        "name": "baseline",
        "dataset_id": dataset_id,
        "prompt_version_id": version_id,
        "provider_configuration_id": provider_id,
        "evaluators": [{"type": "exact_match", "config": {}}],
    }
    first = client.post("/runs", json=payload)
    assert first.status_code == 202 and first.json()["status"] == "pending"
    assert enqueued == [first.json()["id"]]
    asyncio.run(execute_run(first.json()["id"], session_factory))
    completed = client.get(f"/runs/{first.json()['id']}").json()
    assert completed["status"] == "completed"
    assert completed["metrics"]["average_score"] == 1
    assert completed["metrics"]["input_tokens"] > 0
    result = client.get(f"/runs/{first.json()['id']}/results").json()[0]
    assert result["rendered_prompt"] == "Capital of Canada?"
    assert result["actual_output"] == "Ottawa"
    assert result["estimated_cost"] is None
    with session_factory() as db:
        provider = db.get(EvaluationRun, first.json()["id"])
        assert provider is not None
    second_provider = client.post(
        "/providers",
        json={
            "name": "Changed mock",
            "provider_type": "mock",
            "model_name": "mock-v2",
            "configuration": {"mock_response": "Toronto"},
        },
    ).json()
    payload["provider_configuration_id"] = second_provider["id"]
    payload["name"] = "candidate"
    second = client.post("/runs", json=payload).json()
    asyncio.run(execute_run(second["id"], session_factory))
    comparison = client.get(
        "/comparisons", params={"run_a": first.json()["id"], "run_b": second["id"]}
    ).json()
    assert comparison["deltas"]["average_score"] == -1
    assert len(comparison["regressions"]) == 1
    reverse = client.get(
        "/comparisons", params={"run_a": second["id"], "run_b": first.json()["id"]}
    ).json()
    assert len(reverse["improvements"]) == 1


def test_one_case_failure_does_not_fail_run(
    client: TestClient, session_factory: sessionmaker[Session], monkeypatch
):
    monkeypatch.setattr("app.queue.enqueue_run", lambda _: None)
    dataset_id, version_id, provider_id = setup_resources(client)
    case = {"input": "France", "expected_output": "Paris"}
    client.post(f"/datasets/{dataset_id}/test-cases", json=case)
    with session_factory() as db:
        from app.models import ProviderConfiguration

        provider = db.get(ProviderConfiguration, provider_id)
        provider.configuration = {
            "mock_response": "Paris",
            "mock_error_inputs": ["Capital of Canada?"],
        }
        db.commit()
    run = client.post(
        "/runs",
        json={
            "name": "partial",
            "dataset_id": dataset_id,
            "prompt_version_id": version_id,
            "provider_configuration_id": provider_id,
            "evaluators": [{"type": "exact_match"}],
        },
    ).json()
    asyncio.run(execute_run(run["id"], session_factory))
    detail = client.get(f"/runs/{run['id']}").json()
    results = client.get(f"/runs/{run['id']}/results").json()
    assert detail["status"] == "completed" and detail["metrics"]["failed_requests"] == 1
    assert sum(bool(result["error"]) for result in results) == 1
    assert sum(result["scores"][0]["score"] for result in results if result["scores"]) == 1


def test_mock_provider_is_deterministic():
    provider = MockProvider()
    config = GenerationConfig("mock-v1", {"mock_responses": {"question": "answer"}})
    first = asyncio.run(provider.generate("question", config))
    second = asyncio.run(provider.generate("question", config))
    assert first.content == second.content == "answer"
    assert first.input_tokens == 1 and first.estimated_cost is None


def test_queue_failure_is_recorded(client: TestClient, monkeypatch):
    def unavailable(_: str) -> None:
        raise ConnectionError("Redis unavailable")

    monkeypatch.setattr("app.queue.enqueue_run", unavailable)
    dataset_id, version_id, provider_id = setup_resources(client)
    response = client.post(
        "/runs",
        json={
            "name": "queued",
            "dataset_id": dataset_id,
            "prompt_version_id": version_id,
            "provider_configuration_id": provider_id,
            "evaluators": [{"type": "exact_match"}],
        },
    )
    assert response.status_code == 503
    assert client.get("/runs").json()[0]["status"] == "failed"
    assert client.get("/runs").json()[0]["error"] == "Evaluation queue is unavailable"


def test_concurrency_limit(client: TestClient, session_factory: sessionmaker[Session], monkeypatch):
    from app.providers import PROVIDERS

    class TrackingProvider(MockProvider):
        active = 0
        maximum = 0

        async def generate(self, prompt: str, config: GenerationConfig) -> GenerationResult:
            self.active += 1
            self.maximum = max(self.maximum, self.active)
            await asyncio.sleep(0.01)
            self.active -= 1
            return await super().generate(prompt, config)

    provider = TrackingProvider()
    monkeypatch.setitem(PROVIDERS, "mock", provider)
    monkeypatch.setattr(
        "app.execution.get_settings", lambda: SimpleNamespace(evalforge_max_concurrency=2)
    )
    monkeypatch.setattr("app.queue.enqueue_run", lambda _: None)
    dataset_id, version_id, provider_id = setup_resources(client)
    client.post(
        f"/datasets/{dataset_id}/import",
        json=[
            {"input": "France", "expected_output": "Paris"},
            {"input": "Germany", "expected_output": "Berlin"},
            {"input": "Japan", "expected_output": "Tokyo"},
        ],
    )
    run = client.post(
        "/runs",
        json={
            "name": "concurrent",
            "dataset_id": dataset_id,
            "prompt_version_id": version_id,
            "provider_configuration_id": provider_id,
            "evaluators": [{"type": "exact_match"}],
        },
    ).json()
    asyncio.run(execute_run(run["id"], session_factory))
    assert provider.maximum == 2
    assert client.get(f"/runs/{run['id']}").json()["result_count"] == 4


def test_run_snapshots_cases_and_validates_comparison(
    client: TestClient, session_factory: sessionmaker[Session], monkeypatch
):
    monkeypatch.setattr("app.queue.enqueue_run", lambda _: None)
    dataset_id, version_id, provider_id = setup_resources(client)
    payload = {
        "name": "first",
        "dataset_id": dataset_id,
        "prompt_version_id": version_id,
        "provider_configuration_id": provider_id,
        "evaluators": [{"type": "exact_match", "config": {}}],
    }
    first = client.post("/runs", json=payload).json()
    original_case = client.get(f"/datasets/{dataset_id}").json()["test_cases"][0]["id"]
    assert client.delete(f"/test-cases/{original_case}").status_code == 409
    client.post(
        f"/datasets/{dataset_id}/test-cases", json={"input": "France", "expected_output": "Paris"}
    )
    asyncio.run(execute_run(first["id"], session_factory))
    assert client.get(f"/runs/{first['id']}").json()["total_cases"] == 1
    assert client.get(f"/runs/{first['id']}").json()["result_count"] == 1
    payload["name"] = "second"
    payload["evaluators"] = [{"type": "contains", "config": {}}]
    second = client.post("/runs", json=payload).json()
    asyncio.run(execute_run(second["id"], session_factory))
    assert (
        client.get("/comparisons", params={"run_a": first["id"], "run_b": second["id"]}).status_code
        == 422
    )
