from app.presets.loader import load_all_presets
from app.schemas.village import VillageConfig


def test_all_preset_files_validate():
    configs = load_all_presets()
    assert len(configs) == 3
    for config in configs:
        assert isinstance(config, VillageConfig)


def test_list_presets_returns_three(client):
    response = client.get("/api/presets")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    ids = {item["id"] for item in data}
    assert ids == {"kutch_village", "dang_village", "sundarbans_island"}


def test_get_known_preset(client):
    response = client.get("/api/presets/kutch_village")
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == "kutch_village"
    assert data["solar"]["capacity_kw"] == 20


def test_get_unknown_preset_404(client):
    response = client.get("/api/presets/does_not_exist")
    assert response.status_code == 404
