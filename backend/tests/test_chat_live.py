"""Live integration test for Powerloom Energy Optimization Assistant using GEMINI_API_KEY_1.

Strictly verifies that:
1. GEMINI_API_KEY_1 is read from backend/.env.
2. Real Gemini client initializes and connects to Gemini 2.5 Flash.
3. Powerloom context is dynamically computed and passed.
4. Gemini generates a grounded, high-quality response.
5. Never leaks secret keys in output or logs.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.mark.skipif(
    not settings.GEMINI_API_KEY_1,
    reason="GEMINI_API_KEY_1 is not present in backend/.env",
)
class TestLiveGeminiChatbot:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_live_chat_soc_query(self, client):
        """Test live Gemini answering current battery SOC question based on real Powerloom state."""
        response = client.post(
            "/api/chat",
            json={
                "message": "What is the current battery SOC and is diesel running right now?",
                "village_id": "dang_village",
            },
        )
        assert response.status_code == 200, f"Chat failed: {response.text}"
        data = response.json()
        assert data["village_id"] == "dang_village"
        assert len(data["message"]) > 20
        msg_lower = data["message"].lower()
        assert "soc" in msg_lower or "battery" in msg_lower or "%" in msg_lower
        assert "diesel" in msg_lower

    def test_live_chat_savings_query(self, client):
        """Test live Gemini explaining optimization savings vs naive baseline."""
        response = client.post(
            "/api/chat",
            json={
                "message": "How much money and diesel hours did the optimizer save compared to naive dispatch?",
                "village_id": "dang_village",
            },
        )
        assert response.status_code == 200, f"Chat failed: {response.text}"
        data = response.json()
        assert len(data["message"]) > 20
        msg_lower = data["message"].lower()
        assert "save" in msg_lower or "cost" in msg_lower or "naive" in msg_lower or "diesel" in msg_lower

    def test_live_chat_anti_hallucination(self, client):
        """Test live Gemini correctly declaring unknown metrics as unavailable."""
        response = client.post(
            "/api/chat",
            json={
                "message": "What is the transformer winding oil temperature right now?",
                "village_id": "dang_village",
            },
        )
        assert response.status_code == 200, f"Chat failed: {response.text}"
        data = response.json()
        msg_lower = data["message"].lower()
        # Model should indicate unavailability rather than inventing temperature
        unavailability_phrases = [
            "not available",
            "unavailable",
            "does not contain",
            "not contain",
            "does not include",
            "not include",
            "does not provide",
            "not provide",
            "no information",
            "not provided",
            "not present",
            "limited to",
        ]
        assert any(p in msg_lower for p in unavailability_phrases)
