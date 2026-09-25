import pytest

from app.evaluators import EVALUATORS
from app.metrics import percentile, summary
from app.templating import render_prompt


def test_prompt_rendering_and_missing_variables():
    assert render_prompt("Hi {{person.name}}: {{input}}", {"person": {"name": "Sam"}}).startswith(
        "Hi Sam:"
    )
    with pytest.raises(ValueError, match="Missing prompt variable"):
        render_prompt("{{missing}}", "hello")


def test_exact_match_and_contains():
    exact = EVALUATORS["exact_match"]
    assert (
        exact.evaluate(
            "Ottawa", " ottawa  ", {"case_sensitive": False, "normalize_whitespace": True}, {}
        ).score
        == 1
    )
    assert exact.evaluate("Ottawa", "ottawa", {"case_sensitive": False}, {}).score == 1
    assert EVALUATORS["contains"].evaluate("Ottawa", "Capital: Ottawa", {}, {}).score == 1


def test_json_evaluators():
    validity = EVALUATORS["json_validity"]
    assert validity.evaluate(None, '{"ok": true}', {}, {}).score == 1
    assert validity.evaluate(None, "{bad", {}, {}).score == 0
    schema = {"type": "object", "required": ["name"], "properties": {"name": {"type": "string"}}}
    evaluator = EVALUATORS["json_schema"]
    assert evaluator.evaluate(None, '{"name":"A"}', {}, {"json_schema": schema}).score == 1
    failure = evaluator.evaluate(None, '{"name":5}', {}, {"json_schema": schema})
    assert failure.score == 0 and failure.details["errors"]


def test_similarity_is_local_token_overlap():
    score = EVALUATORS["semantic_similarity"].evaluate("red car", "red vehicle", {}, {})
    assert score.score == pytest.approx(1 / 3)
    assert score.details["method"] == "token_jaccard"


def test_statistics_small_samples():
    assert summary([])["p95"] is None
    assert summary([5])["p95"] == 5
    assert percentile([1, 2, 3, 4], 0.95) == pytest.approx(3.85)
    assert summary([1, 2, 3, 4])["median"] == 2.5
