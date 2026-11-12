import os
import tempfile
from pathlib import Path

_tmp = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_tmp, 'test.db').as_posix()}"
os.environ["LLM_PROVIDER"] = "mock"
Path(_tmp, "panel", "assets").mkdir(parents=True)
Path(_tmp, "panel", "index.html").write_text("<title>panel</title>", encoding="utf-8")
os.environ["STATIC_DIR"] = str(Path(_tmp, "panel"))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        yield c
