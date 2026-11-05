from __future__ import annotations

import calendar
import os
from datetime import date
from decimal import Decimal
from typing import Optional, Union

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import Base, engine, get_db
from models import Budget, Transaction, User
from schemas import (
    AuthResponse,
    BudgetInput,
    BudgetResponse,
    LoginRequest,
    RegisterRequest,
    TransactionInput,
    TransactionResponse,
    UserResponse,
)


Base.metadata.create_all(bind=engine)
app = FastAPI(title="Personal Expense Tracker API", version="1.0.0")
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.scalar(select(User).where(User.email == payload.email))
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    user = User(name=payload.name, email=payload.email, hashed_password=hash_password(payload.password))
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="An account with this email already exists")
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to create account")
    return AuthResponse(access_token=create_access_token(user.id), user=user)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.strip().lower()))
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(access_token=create_access_token(user.id), user=user)


@app.get("/api/auth/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user


@app.get("/api/transactions", response_model=list[TransactionResponse])
def list_transactions(
    search: Optional[str] = None,
    category: Optional[str] = None,
    type: Optional[str] = Query(default=None, pattern="^(income|expense)$"),
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    sort_by: str = Query(default="date", pattern="^(date|amount)$"),
    order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(Transaction).where(Transaction.user_id == user.id)
    if search:
        query = query.where(Transaction.title.ilike(f"%{search.strip()}%"))
    if category:
        query = query.where(Transaction.category == category)
    if type:
        query = query.where(Transaction.type == type)
    if start_date:
        query = query.where(Transaction.date >= start_date)
    if end_date:
        query = query.where(Transaction.date <= end_date)
    column = Transaction.amount if sort_by == "amount" else Transaction.date
    query = query.order_by(column.asc() if order == "asc" else column.desc(), Transaction.id.desc())
    return db.scalars(query).all()


@app.post("/api/transactions", response_model=TransactionResponse, status_code=201)
def create_transaction(
    payload: TransactionInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    transaction = Transaction(**payload.model_dump(), user_id=user.id)
    try:
        db.add(transaction)
        db.commit()
        db.refresh(transaction)
        return transaction
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to save transaction")


@app.put("/api/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    payload: TransactionInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    transaction = db.scalar(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user.id)
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in payload.model_dump().items():
        setattr(transaction, field, value)
    try:
        db.commit()
        db.refresh(transaction)
        return transaction
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to update transaction")


@app.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    transaction = db.scalar(
        select(Transaction).where(Transaction.id == transaction_id, Transaction.user_id == user.id)
    )
    if transaction is None:
        raise HTTPException(status_code=404, detail="Transaction not found")
    try:
        db.delete(transaction)
        db.commit()
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to delete transaction")


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    return date(year, month, 1), date(year, month, calendar.monthrange(year, month)[1])


@app.get("/api/dashboard/summary")
def dashboard_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    today = date.today()
    month_start, month_end = _month_bounds(today.year, today.month)
    totals = db.execute(
        select(
            Transaction.type,
            func.coalesce(func.sum(Transaction.amount), 0),
        ).where(Transaction.user_id == user.id).group_by(Transaction.type)
    ).all()
    values = {kind: Decimal(str(total)) for kind, total in totals}
    month_expenses = db.scalar(
        select(func.coalesce(func.sum(Transaction.amount), 0)).where(
            Transaction.user_id == user.id,
            Transaction.type == "expense",
            Transaction.date >= month_start,
            Transaction.date <= month_end,
        )
    )
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == user.id, Budget.year == today.year, Budget.month == today.month
        )
    )
    recent = db.scalars(
        select(Transaction)
        .where(Transaction.user_id == user.id)
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(5)
    ).all()
    return {
        "total_income": values.get("income", Decimal("0.00")),
        "total_expenses": values.get("expense", Decimal("0.00")),
        "balance": values.get("income", Decimal("0.00")) - values.get("expense", Decimal("0.00")),
        "monthly_expenses": Decimal(str(month_expenses)),
        "monthly_budget": budget.amount if budget else Decimal("0.00"),
        "budget_remaining": (budget.amount - Decimal(str(month_expenses))) if budget else Decimal("0.00"),
        "budget_exceeded": bool(budget and Decimal(str(month_expenses)) > budget.amount),
        "recent_transactions": recent,
    }


@app.get("/api/dashboard/category-summary")
def category_summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    rows = db.execute(
        select(Transaction.category, func.sum(Transaction.amount).label("total"))
        .where(Transaction.user_id == user.id, Transaction.type == "expense")
        .group_by(Transaction.category)
        .order_by(func.sum(Transaction.amount).desc())
    ).all()
    return [{"category": category, "total": total} for category, total in rows]


@app.get("/api/dashboard/monthly-summary")
def monthly_summary(
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.execute(
        select(
            func.strftime("%m", Transaction.date).label("month"),
            Transaction.type,
            func.sum(Transaction.amount).label("total"),
        )
        .where(Transaction.user_id == user.id, func.strftime("%Y", Transaction.date) == str(year))
        .group_by("month", Transaction.type)
    ).all()
    months = {int(row[0]): {"month": int(row[0]), "income": 0, "expenses": 0} for row in rows}
    for month, kind, total in rows:
        months[int(month)]["income" if kind == "income" else "expenses"] = total
    return [months.get(month, {"month": month, "income": 0, "expenses": 0}) for month in range(1, 13)]


@app.get("/api/budgets", response_model=Union[BudgetResponse, None])
def get_budget(
    year: Optional[int] = Query(default=None, ge=2000, le=2100),
    month: Optional[int] = Query(default=None, ge=1, le=12),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = date.today()
    budget_year = year or today.year
    budget_month = month or today.month
    return db.scalar(
        select(Budget).where(
            Budget.user_id == user.id, Budget.year == budget_year, Budget.month == budget_month
        )
    )


@app.post("/api/budgets", response_model=BudgetResponse)
def save_budget(
    payload: BudgetInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    budget = db.scalar(
        select(Budget).where(
            Budget.user_id == user.id,
            Budget.year == payload.year,
            Budget.month == payload.month,
        )
    )
    try:
        if budget is None:
            budget = Budget(**payload.model_dump(), user_id=user.id)
            db.add(budget)
        else:
            budget.amount = payload.amount
        db.commit()
        db.refresh(budget)
        return budget
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Unable to save budget")
