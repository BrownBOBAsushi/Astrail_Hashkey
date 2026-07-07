"""Compatibility facade for the Astrail agentic payment domain.

New code should import from `backend.payments.*`. This module preserves the
original spike import path used by the FastAPI app and tests.
"""

from backend.payments import service as _service
from backend.payments.service import *  # noqa: F403

for _name in dir(_service):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_service, _name)

__all__ = [_name for _name in globals() if not _name.startswith("__")]
