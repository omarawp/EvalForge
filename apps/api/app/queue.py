from redis import Redis
from rq import Queue

from app.core import get_settings


def enqueue_run(run_id: str) -> None:
    connection = Redis.from_url(get_settings().redis_url)
    Queue("evaluations", connection=connection).enqueue(
        "app.execution.run_evaluation", run_id, job_timeout="1h", result_ttl=3600
    )
