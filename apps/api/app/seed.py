from sqlalchemy import select

from app.db import SessionLocal
from app.models import Dataset, Prompt, PromptVersion, ProviderConfiguration, TestCase
from app.templating import render_prompt

DEMO = [
    (
        "Factual QA",
        "Short, verifiable geography and science answers.",
        "Answer with one short phrase: {{input}}",
        [
            ("What is the capital of Canada?", "Ottawa"),
            ("What is the capital of France?", "Paris"),
            ("What is the chemical symbol for gold?", "Au"),
            ("How many days are in a leap year?", "366"),
            ("What planet is known as the Red Planet?", "Mars"),
            ("What is the largest ocean on Earth?", "Pacific Ocean"),
        ],
    ),
    (
        "Sentiment labels",
        "Single-label classification examples.",
        "Classify sentiment as positive, negative, or neutral: {{input}}",
        [
            ("The delivery arrived early and works perfectly.", "positive"),
            ("The package was broken and support never replied.", "negative"),
            ("The meeting starts at 2 PM.", "neutral"),
            ("Setup was simple and the results are excellent.", "positive"),
        ],
    ),
    (
        "JSON extraction",
        "Structured entities with a supplied JSON schema.",
        "Extract the name and city as JSON: {{input}}",
        [
            ("Avery lives in Toronto.", '{"name":"Avery","city":"Toronto"}'),
            ("Jordan lives in Vancouver.", '{"name":"Jordan","city":"Vancouver"}'),
            ("Morgan lives in Montreal.", '{"name":"Morgan","city":"Montreal"}'),
        ],
    ),
]


def main() -> None:
    responses: dict[str, str] = {}
    with SessionLocal() as db:
        for name, description, template, examples in DEMO:
            for input_value, expected in examples:
                responses[render_prompt(template, input_value)] = expected
            if not db.scalar(select(Dataset).where(Dataset.name == name)):
                dataset = Dataset(name=name, description=description)
                for input_value, expected in examples:
                    metadata = {}
                    if name == "JSON extraction":
                        metadata = {
                            "json_schema": {
                                "type": "object",
                                "required": ["name", "city"],
                                "properties": {
                                    "name": {"type": "string"},
                                    "city": {"type": "string"},
                                },
                            }
                        }
                    dataset.test_cases.append(
                        TestCase(
                            input=input_value, expected_output=expected, case_metadata=metadata
                        )
                    )
                db.add(dataset)
            if not db.scalar(select(Prompt).where(Prompt.name == name)):
                prompt = Prompt(name=name, description=description)
                prompt.versions.append(PromptVersion(version=1, template=template))
                db.add(prompt)
        if not db.scalar(
            select(ProviderConfiguration).where(
                ProviderConfiguration.name == "Demo deterministic mock"
            )
        ):
            db.add(
                ProviderConfiguration(
                    name="Demo deterministic mock",
                    provider_type="mock",
                    model_name="fixture-mock-v1",
                    configuration={"mock_responses": responses},
                )
            )
        db.commit()
    print(
        "Demo datasets, prompts, and deterministic mock provider are ready. No runs were created."
    )


if __name__ == "__main__":
    main()
