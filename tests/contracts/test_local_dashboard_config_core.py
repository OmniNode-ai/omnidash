"""Validate local dashboard pages with the actual omnibase_core model."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError
from yaml import safe_load

from omnibase_core.models.dashboard import ModelDashboardConfig

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOCAL_PAGES = PROJECT_ROOT / "src" / "pages" / "local"
PAGE_NAMES = ("overview", "runs")


def _load_page(page_name: str) -> dict[str, Any]:
    page_path = LOCAL_PAGES / f"{page_name}.page.yaml"
    loaded = safe_load(page_path.read_text(encoding="utf-8"))
    assert isinstance(loaded, dict), f"{page_path.name} must contain a mapping"
    return loaded


@pytest.mark.parametrize("page_name", PAGE_NAMES)
def test_local_dashboard_page_validates_with_core_model(page_name: str) -> None:
    raw_page = _load_page(page_name)

    config = ModelDashboardConfig.model_validate(raw_page)

    assert str(config.dashboard_id) == raw_page["dashboard_id"]
    assert config.name
    assert config.widgets


def test_core_model_rejects_component_contracts_at_dashboard_root() -> None:
    raw_page = _load_page("overview")

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ModelDashboardConfig.model_validate({**raw_page, "components": []})
