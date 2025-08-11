from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Counselor

router = APIRouter()

@router.get("/")
def list_counselors(db: Session = Depends(get_db)):
    rows = db.query(Counselor).order_by(Counselor.name).all()
    return [{"id": c.id, "name": c.name, "branch": c.branch, "team": c.team, "status": c.status} for c in rows]
