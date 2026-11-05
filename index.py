"""Vercel entrypoint for the FastAPI backend."""
import os
import sys
from pathlib import Path

os.environ.setdefault("TORCH_HOME", "/tmp/findback-torch")
sys.path.insert(0, str(Path(__file__).resolve().parent / "backend"))

from main import app  # noqa: E402,F401
