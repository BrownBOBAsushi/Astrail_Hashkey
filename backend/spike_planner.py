"""Compatibility facade for the Astrail planner domain.

New code should import from `backend.planner.*`. This module preserves the
original spike import path used by the FastAPI app and tests.
"""

from backend.planner import runner as _runner
from backend.planner.runner import *  # noqa: F403

for _name in dir(_runner):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_runner, _name)

__all__ = [_name for _name in globals() if not _name.startswith("__")]
