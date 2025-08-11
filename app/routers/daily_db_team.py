# app/routers/daily_db_team.py
from datetime import date
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.db import get_db
from app.models import DailyDBTeam

router = APIRouter()

class DailyDBTeamPayload(BaseModel):
    date: date
    team: str
    db_count: int

@router.post("/")
def upsert_daily_db_team(payload: DailyDBTeamPayload, db: Session = Depends(get_db)):
    row = db.query(DailyDBTeam).filter(and_(DailyDBTeam.date == payload.date, DailyDBTeam.team == payload.team)).first()
    if row:
        row.db_count = payload.db_count
    else:
        row = DailyDBTeam(date=payload.date, team=payload.team, db_count=payload.db_count)
        db.add(row)
    db.commit()
    return {"ok": True}

@router.get("/")
def list_daily_db_team(db: Session = Depends(get_db)):
    rows = db.query(DailyDBTeam).order_by(DailyDBTeam.date.desc(), DailyDBTeam.team).all()
    return [{"id": r.id, "date": r.date.isoformat(), "team": r.team, "db_count": r.db_count} for r in rows]
