from datetime import date, time
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.db import get_db
from app.models import Session as Sess, Counselor, STATUSES, MODES
from app.services.validators import (
    is_30min_grid, check_overlap, enforce_conditionals,
    branch_subject_guard, validate_branch_team
)

router = APIRouter()

class SessionCreate(BaseModel):
    date: date
    start_time: time
    end_time: time
    counselor_id: int
    branch: str
    team: str
    requested_subject_id: Optional[int] = None
    registered_subject_id: Optional[int] = None
    mode: str = Field(default="OFFLINE")
    status: str = Field(default="PENDING")
    cancel_reason: Optional[str] = None
    comment: Optional[str] = None

class SessionUpdate(SessionCreate):
    pass

@router.get("/")
def list_sessions(
    db: Session = Depends(get_db),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    branch: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    counselor_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    mode: Optional[str] = Query(None)
):
    q = db.query(Sess)
    if from_date: q = q.filter(Sess.date >= from_date)
    if to_date: q = q.filter(Sess.date <= to_date)
    if branch: q = q.filter(Sess.branch == branch)
    if team: q = q.filter(Sess.team == team)
    if counselor_id: q = q.filter(Sess.counselor_id == counselor_id)
    if status: q = q.filter(Sess.status == status)
    if mode: q = q.filter(Sess.mode == mode)
    items = q.order_by(Sess.date, Sess.start_time).all()
    return [{
        "id": s.id,
        "date": s.date.isoformat(),
        "start_time": s.start_time.isoformat(),
        "end_time": s.end_time.isoformat(),
        "counselor_id": s.counselor_id,
        "branch": s.branch,
        "team": s.team,
        "requested_subject_id": s.requested_subject_id,
        "registered_subject_id": s.registered_subject_id,
        "mode": s.mode,
        "status": s.status,
        "cancel_reason": s.cancel_reason,
        "comment": s.comment
    } for s in items]

@router.post("/")
def create_session(payload: SessionCreate, db: Session = Depends(get_db)):
    if payload.status not in STATUSES:
        raise HTTPException(400, "유효하지 않은 상태입니다.")
    if payload.mode not in MODES:
        raise HTTPException(400, "유효하지 않은 비대면/오프라인 값입니다.")
    if not is_30min_grid(payload.start_time) or not is_30min_grid(payload.end_time):
        raise HTTPException(400, "시작/종료 시각은 30분 단위여야 합니다.")
    if payload.end_time <= payload.start_time:
        raise HTTPException(400, "종료 시각은 시작 시각보다 커야 합니다.")
    cons = db.query(Counselor).filter(Counselor.id == payload.counselor_id).first()
    if not cons:
        raise HTTPException(404, "상담사를 찾을 수 없습니다.")
    if check_overlap(db, counselor_id=payload.counselor_id, date=payload.date,
                     start_time=payload.start_time, end_time=payload.end_time):
        raise HTTPException(400, "동일 상담사의 시간이 겹칩니다.")
    try:
        validate_branch_team(db, branch=payload.branch, team=payload.team)
        enforce_conditionals(status=payload.status,
                             registered_subject_id=payload.registered_subject_id,
                             cancel_reason=payload.cancel_reason)
        branch_subject_guard(db, branch=payload.branch,
                             requested_subject_id=payload.requested_subject_id,
                             registered_subject_id=payload.registered_subject_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    s = Sess(
        date=payload.date, start_time=payload.start_time, end_time=payload.end_time,
        counselor_id=payload.counselor_id, branch=payload.branch, team=payload.team,
        requested_subject_id=payload.requested_subject_id, registered_subject_id=payload.registered_subject_id,
        mode=payload.mode, status=payload.status, cancel_reason=payload.cancel_reason, comment=payload.comment
    )
    db.add(s); db.commit(); db.refresh(s)
    return {"id": s.id}
