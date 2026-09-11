def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == "powerloom"
    assert data["solver_available"] is True
    assert data["database"] == "sqlite"
    assert data["database_ok"] is True
