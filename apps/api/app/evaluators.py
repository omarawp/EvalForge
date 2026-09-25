import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from functools import lru_cache
from importlib.util import find_spec
from typing import Any

from jsonschema import Draft202012Validator


@dataclass
class Score:
    score: float
    details: dict[str, Any] = field(default_factory=dict)


class Evaluator(ABC):
    @abstractmethod
    def evaluate(
        self, expected: Any, actual: Any, config: dict[str, Any], metadata: dict[str, Any]
    ) -> Score:
        raise NotImplementedError


class ExactMatch(Evaluator):
    def evaluate(
        self, expected: Any, actual: Any, config: dict[str, Any], metadata: dict[str, Any]
    ) -> Score:
        if isinstance(expected, str) and isinstance(actual, str):
            if config.get("normalize_whitespace", False):
                expected, actual = " ".join(expected.split()), " ".join(actual.split())
            if not config.get("case_sensitive", True):
                expected, actual = expected.casefold(), actual.casefold()
        return Score(float(expected == actual))


class Contains(Evaluator):
    def evaluate(
        self, expected: Any, actual: Any, config: dict[str, Any], metadata: dict[str, Any]
    ) -> Score:
        if not isinstance(expected, str) or not isinstance(actual, str):
            return Score(0.0, {"error": "Contains requires string expected and actual outputs"})
        if not config.get("case_sensitive", True):
            expected, actual = expected.casefold(), actual.casefold()
        return Score(float(expected in actual))


class JSONValidity(Evaluator):
    def evaluate(
        self, expected: Any, actual: Any, config: dict[str, Any], metadata: dict[str, Any]
    ) -> Score:
        try:
            json.loads(actual) if isinstance(actual, str) else json.dumps(actual)
            return Score(1.0)
        except (TypeError, ValueError) as exc:
            return Score(0.0, {"error": str(exc)[:300]})


class JSONSchema(Evaluator):
    def evaluate(
        self, expected: Any, actual: Any, config: dict[str, Any], metadata: dict[str, Any]
    ) -> Score:
        schema = metadata.get("json_schema")
        if schema is None:
            return Score(0.0, {"error": "Test case metadata.json_schema is required"})
        try:
            data = json.loads(actual) if isinstance(actual, str) else actual
            errors = list(Draft202012Validator(schema).iter_errors(data))
            return Score(
                float(not errors),
                {
                    "errors": [
                        f"{'/'.join(map(str, e.path))}: {e.message}"[:300] for e in errors[:10]
                    ]
                },
            )
        except Exception as exc:
            return Score(0.0, {"error": str(exc)[:300]})


@lru_cache(maxsize=1)
def local_embedding_model():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")


class SemanticSimilarity(Evaluator):
    def evaluate(
        self, expected: Any, actual: Any, config: dict[str, Any], metadata: dict[str, Any]
    ) -> Score:
        if not isinstance(expected, str) or not isinstance(actual, str):
            return Score(0.0, {"error": "Semantic similarity requires strings"})
        if config.get("method") == "local_embeddings":
            vectors = local_embedding_model().encode([expected, actual], normalize_embeddings=True)
            cosine = float(vectors[0] @ vectors[1])
            return Score(
                max(0.0, min(1.0, cosine)),
                {"method": "local_embeddings", "model": "all-MiniLM-L6-v2"},
            )
        a = set(re.findall(r"\w+", expected.casefold()))
        b = set(re.findall(r"\w+", actual.casefold()))
        return Score(len(a & b) / len(a | b) if a | b else 1.0, {"method": "token_jaccard"})


EVALUATORS: dict[str, Evaluator] = {
    "exact_match": ExactMatch(),
    "contains": Contains(),
    "json_validity": JSONValidity(),
    "json_schema": JSONSchema(),
    "semantic_similarity": SemanticSimilarity(),
}


def validate_spec(kind: str, config: dict[str, Any]) -> None:
    if kind not in EVALUATORS:
        raise ValueError(f"Unknown evaluator: {kind}")
    allowed = {
        "exact_match": {"case_sensitive", "normalize_whitespace"},
        "contains": {"case_sensitive"},
        "json_validity": set(),
        "json_schema": set(),
        "semantic_similarity": {"method"},
    }[kind]
    if set(config) - allowed:
        raise ValueError(f"Unsupported {kind} configuration")
    if kind == "semantic_similarity":
        method = config.get("method", "token_jaccard")
        if method not in {"token_jaccard", "local_embeddings"}:
            raise ValueError("Unsupported similarity method")
        if method == "local_embeddings" and find_spec("sentence_transformers") is None:
            raise ValueError("Install the semantic extra to use local_embeddings")
    elif any(not isinstance(v, bool) for v in config.values()):
        raise ValueError(f"{kind} configuration values must be booleans")
