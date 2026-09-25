import fakeredis
from rq import Queue

from app.queue import enqueue_run


def test_run_is_enqueued_for_worker(monkeypatch):
    redis = fakeredis.FakeRedis()
    monkeypatch.setattr("app.queue.Redis.from_url", lambda _: redis)
    enqueue_run("run-id")
    queue = Queue("evaluations", connection=redis)
    assert len(queue.job_ids) == 1
    job = queue.fetch_job(queue.job_ids[0])
    assert job is not None
    assert job.func_name == "app.execution.run_evaluation"
    assert job.args == ("run-id",)
