# app/routers/daily_db.py
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.db import get_db
from app.models import DailyDB

router = APIRouter()

class DailyDBPayload(BaseModel):
    date: date
    branch: str
    db_count: int

@router.post("/")
def upsert_daily_db(payload: DailyDBPayload, db: Session = Depends(get_db)):
    # 동일 (date, branch) 유니크 보장: upsert 형태
    row = db.query(DailyDB).filter(and_(DailyDB.date==payload.date, DailyDB.branch==payload.branch)).first()
    if row:
        row.db_count = payload.db_count
    else:
        row = DailyDB(date=payload.date, branch=payload.branch, db_count=payload.db_count)
        db.add(row)
    db.commit()
    return {"ok": True}

@router.get("/")
def list_daily_db(db: Session = Depends(get_db)):
    rows = db.query(DailyDB).order_by(DailyDB.date.desc(), DailyDB.branch).all()
    return [{"id": r.id, "date": r.date.isoformat(), "branch": r.branch, "db_count": r.db_count} for r in rows]
