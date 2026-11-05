from datetime import date

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from database import Base, get_db
from main import app


test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


def override_get_db():
    db = TestingSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_function():
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)


def register(email="alex@example.com"):
    response = client.post(
        "/api/auth/register",
        json={"name": "Alex User", "email": email, "password": "securepass123"},
    )
    assert response.status_code == 201
    return response.json()["access_token"]


def test_registration_login_and_duplicate_email():
    token = register()
    login_response = client.post(
        "/api/auth/login", json={"email": "alex@example.com", "password": "securepass123"}
    )
    assert login_response.status_code == 200
    assert login_response.json()["user"]["email"] == "alex@example.com"
    assert client.post(
        "/api/auth/register",
        json={"name": "Alex", "email": "alex@example.com", "password": "securepass123"},
    ).status_code == 409
    assert client.post(
        "/api/auth/login", json={"email": "alex@example.com", "password": "wrongpass"}
    ).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_transaction_crud_ownership_and_dashboard():
    token = register()
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "title": "Groceries",
        "amount": "42.50",
        "category": "Food",
        "type": "expense",
        "date": date.today().isoformat(),
        "description": "Weekly shop",
        "payment_method": "Card",
    }
    created = client.post("/api/transactions", json=payload, headers=headers)
    assert created.status_code == 201
    transaction_id = created.json()["id"]
    assert client.get("/api/dashboard/summary", headers=headers).json()["total_expenses"] == 42.5
    assert client.get("/api/dashboard/category-summary", headers=headers).json()[0]["category"] == "Food"

    other_token = register("other@example.com")
    other_headers = {"Authorization": f"Bearer {other_token}"}
    assert client.get("/api/transactions", headers=other_headers).json() == []
    assert client.delete(f"/api/transactions/{transaction_id}", headers=other_headers).status_code == 404

    payload["amount"] = "50"
    assert client.put(
        f"/api/transactions/{transaction_id}", json=payload, headers=headers
    ).status_code == 200
    assert client.delete(f"/api/transactions/{transaction_id}", headers=headers).status_code == 204


def test_validation_budget_and_auth_required():
    assert client.get("/api/transactions").status_code == 401
    token = register()
    headers = {"Authorization": f"Bearer {token}"}
    invalid = {
        "title": "Bad amount",
        "amount": "-2",
        "category": "Food",
        "type": "expense",
        "date": date.today().isoformat(),
    }
    assert client.post("/api/transactions", json=invalid, headers=headers).status_code == 422
    budget = client.post(
        "/api/budgets",
        json={"amount": "1200", "year": date.today().year, "month": date.today().month},
        headers=headers,
    )
    assert budget.status_code == 200
    assert client.get("/api/dashboard/summary", headers=headers).json()["monthly_budget"] == 1200
    assert len(client.get("/api/dashboard/monthly-summary", headers=headers).json()) == 12
