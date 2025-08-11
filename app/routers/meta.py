from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Branch, Team

router = APIRouter()

# 공용 모델
class MetaUpsert(BaseModel):
    code: str
    label_ko: str
    active: bool = True

# 지점
@router.get("/branches")
def list_branches(active: bool | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(Branch)
    if active is not None:
        q = q.filter(Branch.active == active)
    rows = q.order_by(Branch.code).all()
    return [{"code": r.code, "label_ko": r.label_ko, "active": r.active} for r in rows]

@router.post("/branches")
def upsert_branch(payload: MetaUpsert, db: Session = Depends(get_db)):
    row = db.query(Branch).filter(Branch.code == payload.code).first()
    if row:
        row.label_ko = payload.label_ko
        row.active = payload.active
    else:
        db.add(Branch(code=payload.code, label_ko=payload.label_ko, active=payload.active))
    db.commit()
    return {"ok": True}

@router.patch("/branches/{code}/toggle")
def toggle_branch(code: str, db: Session = Depends(get_db)):
    row = db.query(Branch).filter(Branch.code == code).first()
    if not row: raise HTTPException(404, "지점을 찾을 수 없습니다.")
    row.active = not row.active
    db.commit()
    return {"code": row.code, "active": row.active}

# 팀
@router.get("/teams")
def list_teams(active: bool | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(Team)
    if active is not None:
        q = q.filter(Team.active == active)
    rows = q.order_by(Team.code).all()
    return [{"code": r.code, "label_ko": r.label_ko, "active": r.active} for r in rows]

@router.post("/teams")
def upsert_team(payload: MetaUpsert, db: Session = Depends(get_db)):
    row = db.query(Team).filter(Team.code == payload.code).first()
    if row:
        row.label_ko = payload.label_ko
        row.active = payload.active
    else:
        db.add(Team(code=payload.code, label_ko=payload.label_ko, active=payload.active))
    db.commit()
    return {"ok": True}

@router.patch("/teams/{code}/toggle")
def toggle_team(code: str, db: Session = Depends(get_db)):
    row = db.query(Team).filter(Team.code == code).first()
    if not row: raise HTTPException(404, "팀을 찾을 수 없습니다.")
    row.active = not row.active
    db.commit()
    return {"code": row.code, "active": row.active}
