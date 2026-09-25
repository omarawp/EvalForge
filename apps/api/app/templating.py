import json
import re
from typing import Any

VARIABLE = re.compile(r"{{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}")


def render_prompt(template: str, case_input: Any, metadata: dict[str, Any] | None = None) -> str:
    unmatched = VARIABLE.sub("", template)
    if "{{" in unmatched or "}}" in unmatched:
        raise ValueError("Unsupported prompt placeholder syntax")
    context: dict[str, Any] = {"input": case_input, "metadata": metadata or {}}
    if isinstance(case_input, dict):
        context.update(case_input)

    def replace(match: re.Match[str]) -> str:
        path = match.group(1)
        value: Any = context
        for part in path.split("."):
            if not isinstance(value, dict) or part not in value:
                raise ValueError(f"Missing prompt variable: {path}")
            value = value[part]
        return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)

    return VARIABLE.sub(replace, template)
