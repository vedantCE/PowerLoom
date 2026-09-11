import json
from pathlib import Path

from app.schemas.optimize import OptimizeResponse

FIXTURE_PATH = (
    Path(__file__).resolve().parents[1] / "app" / "fixtures" / "sample_optimize_response.json"
)


def _load_fixture() -> dict:
    return json.loads(FIXTURE_PATH.read_text())


def test_fixture_validates_against_schema():
    fixture = _load_fixture()
    response = OptimizeResponse.model_validate(fixture)
    assert response.is_mock is True
    assert len(response.hourly) == 48


def test_fixture_power_balance_and_soc_bounds():
    fixture = _load_fixture()

    def check(hourly: list[dict]) -> None:
        for row in hourly:
            supply = (
                row["solar_used_kw"]
                + row["wind_used_kw"]
                + row["battery_discharge_kw"]
                + row["diesel_kw"]
            )
            demand_side = row["demand_kw"] - row["load_shed_kw"] + row["battery_charge_kw"]
            assert abs(supply - demand_side) <= 0.01, f"hour {row['hour_index']}"
            assert 0.2 - 1e-6 <= row["soc"] <= 1.0 + 1e-6

    check(fixture["hourly"])
    for baseline in fixture["baselines"]:
        check(baseline["hourly"])


def test_optimize_returns_mock_and_creates_run(client):
    response = client.post("/api/optimize", json={"village_id": "kutch_village"})
    assert response.status_code == 200
    data = response.json()
    assert data["is_mock"] is True
    assert data["village_id"] == "kutch_village"
    run_id = data["run_id"]

    runs_response = client.get("/api/runs", params={"village_id": "kutch_village"})
    assert runs_response.status_code == 200
    runs = runs_response.json()
    assert any(run["id"] == run_id for run in runs)


def test_optimize_unknown_village_404(client):
    response = client.post("/api/optimize", json={"village_id": "does_not_exist"})
    assert response.status_code == 404
