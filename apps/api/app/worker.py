import os

from redis import Redis
from rq import Queue, SimpleWorker, Worker

from app.core import get_settings


def main() -> None:
    connection = Redis.from_url(get_settings().redis_url)
    worker_type = SimpleWorker if os.name == "nt" else Worker
    worker_type([Queue("evaluations", connection=connection)], connection=connection).work()


if __name__ == "__main__":
    main()
