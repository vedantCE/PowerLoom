import time

from sqlmodel import Session, select

from app.models.scenario_run import ScenarioRun


def _check_power_balance_and_soc(hourly: list[dict]) -> None:
    for row in hourly:
        supply = (
            row["solar_used_kw"] + row["wind_used_kw"] + row["battery_discharge_kw"] + row["diesel_kw"]
        )
        demand_side = row["demand_kw"] - row["load_shed_kw"] + row["battery_charge_kw"]
        assert abs(supply - demand_side) <= 0.01, f"hour {row['hour_index']}"
        assert 0.0 - 1e-6 <= row["soc"] <= 1.0 + 1e-6


def test_optimize_returns_real_plan(client):
    response = client.post("/api/optimize", json={"village_id": "kutch_village"})
    assert response.status_code == 200
    data = response.json()

    assert data["is_mock"] is False
    assert data["horizon_hours"] == 48
    assert len(data["hourly"]) == 48
    assert {b["strategy"] for b in data["baselines"]} == {"naive", "cycle_charging"}
    assert {s["vs_strategy"] for s in data["savings"]} == {"naive", "cycle_charging"}
    assert data["solver"]["status"].startswith("Optimal")


def test_optimize_persists_scenario_run(client, db_session: Session):
    response = client.post("/api/optimize", json={"village_id": "dang_village"})
    assert response.status_code == 200
    run_id = response.json()["run_id"]

    row = db_session.exec(select(ScenarioRun).where(ScenarioRun.id == run_id)).first()
    assert row is not None
    assert row.village_id == "dang_village"


def test_optimize_response_passes_power_balance_and_soc_checks(client):
    response = client.post("/api/optimize", json={"village_id": "sundarbans_island"})
    assert response.status_code == 200
    data = response.json()

    _check_power_balance_and_soc(data["hourly"])
    for baseline in data["baselines"]:
        _check_power_balance_and_soc(baseline["hourly"])


def test_optimize_unknown_village_returns_422(client):
    response = client.post("/api/optimize", json={"village_id": "does_not_exist"})
    assert response.status_code == 422


def test_optimize_fast_run_with_overrides_is_quick(client):
    payload = {
        "village_id": "kutch_village",
        "overrides": {"cloud_cover_pct": 77.0},
    }
    t0 = time.perf_counter()
    response = client.post("/api/optimize", json=payload)
    elapsed_s = time.perf_counter() - t0

    assert response.status_code == 200
    assert elapsed_s < 3.0
    assert "gap 5.0%" in response.json()["solver"]["status"]
