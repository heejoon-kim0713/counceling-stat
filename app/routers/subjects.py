from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Subject

router = APIRouter()

@router.get("/")
def list_subjects(branch: str | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(Subject).filter(Subject.active == True)
    if branch:
        q = q.filter(Subject.branch == branch)
    return [{"id": s.id, "name": s.name, "branch": s.branch} for s in q.order_by(Subject.name).all()]
