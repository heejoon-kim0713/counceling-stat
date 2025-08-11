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
    row = db.query(DailyDB).filter(and_(DailyDB.date==payload.date, DailyDB.branch==payload.branch)).first()
    if row:
        row.db_count = payload.db_count
    else:
        row = DailyDB(date=payload.date, branch=payload.branch, db_count=payload.db_count)
        db.add(row)
    db.commit()
    return {"ok": True}
