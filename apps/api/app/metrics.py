import math
import statistics
from typing import Any

from app.models import EvaluationResult


def percentile(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    rank = (len(ordered) - 1) * p
    low = math.floor(rank)
    high = math.ceil(rank)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def summary(values: list[float]) -> dict[str, float | None]:
    return {
        "mean": statistics.mean(values) if values else None,
        "median": statistics.median(values) if values else None,
        "p50": percentile(values, 0.5),
        "p95": percentile(values, 0.95),
        "min": min(values) if values else None,
        "max": max(values) if values else None,
    }


def result_score(result: EvaluationResult) -> float | None:
    return statistics.mean(s.score for s in result.scores) if result.scores else None


def run_metrics(results: list[EvaluationResult]) -> dict[str, Any]:
    scores = [score for r in results if (score := result_score(r)) is not None]
    latencies = [r.latency_ms for r in results if r.latency_ms is not None]
    costs = [r.estimated_cost for r in results if r.estimated_cost is not None]
    return {
        "result_count": len(results),
        "scored_count": len(scores),
        "average_score": statistics.mean(scores) if scores else None,
        "pass_rate": sum(score >= 1 for score in scores) / len(scores) if scores else None,
        "scores": summary(scores),
        "latency_ms": summary(latencies),
        "input_tokens": sum(r.input_tokens or 0 for r in results),
        "output_tokens": sum(r.output_tokens or 0 for r in results),
        "estimated_cost": sum(costs) if len(costs) == len(results) and results else None,
        "failed_requests": sum(r.error is not None and r.actual_output is None for r in results),
        "evaluator_errors": sum(
            r.error is not None and r.actual_output is not None for r in results
        ),
    }


def compare_runs(a: list[EvaluationResult], b: list[EvaluationResult]) -> dict[str, Any]:
    left, right = run_metrics(a), run_metrics(b)
    deltas: dict[str, float | None] = {}
    for key in ("average_score", "pass_rate", "estimated_cost", "failed_requests"):
        av, bv = left[key], right[key]
        deltas[key] = bv - av if av is not None and bv is not None else None
    av, bv = left["latency_ms"]["mean"], right["latency_ms"]["mean"]
    deltas["average_latency_ms"] = bv - av if av is not None and bv is not None else None
    by_a = {r.test_case_id: r for r in a}
    by_b = {r.test_case_id: r for r in b}
    changes = []
    for case_id in by_a.keys() & by_b.keys():
        previous, current = result_score(by_a[case_id]), result_score(by_b[case_id])
        if previous is not None and current is not None and previous != current:
            changes.append(
                {
                    "test_case_id": case_id,
                    "input": by_a[case_id].input,
                    "previous": previous,
                    "current": current,
                    "delta": current - previous,
                }
            )
    changes.sort(key=lambda item: item["delta"])
    return {
        "run_a": left,
        "run_b": right,
        "deltas": deltas,
        "regressions": [c for c in changes if c["delta"] < 0],
        "improvements": [c for c in changes if c["delta"] > 0],
    }
