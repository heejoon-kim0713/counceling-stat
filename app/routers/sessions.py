# app/routers/sessions.py
from datetime import date, time
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Path
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
    student_name: Optional[str] = None
    requested_subject_id: Optional[int] = None
    registered_subject_id: Optional[int] = None
    mode: str = Field(default="OFFLINE")
    status: str = Field(default="PENDING")
    cancel_reason: Optional[str] = None
    comment: Optional[str] = None

class SessionUpdate(BaseModel):
    date: Optional[date] = None
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    counselor_id: Optional[int] = None
    branch: Optional[str] = None
    team: Optional[str] = None
    student_name: Optional[str] = None
    requested_subject_id: Optional[int] = None
    registered_subject_id: Optional[int] = None
    mode: Optional[str] = None
    status: Optional[str] = None
    cancel_reason: Optional[str] = None
    comment: Optional[str] = None

class BatchUpdatePayload(BaseModel):
    ids: List[int]
    status: Optional[str] = None
    cancel_reason: Optional[str] = None
    comment: Optional[str] = None
    registered_subject_id: Optional[int] = None

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
        "student_name": s.student_name,
        "requested_subject_id": s.requested_subject_id,
        "registered_subject_id": s.registered_subject_id,
        "mode": s.mode,
        "status": s.status,
        "cancel_reason": s.cancel_reason,
        "comment": s.comment
    } for s in items]

@router.get("/{session_id}")
def get_session(session_id: int = Path(...), db: Session = Depends(get_db)):
    s = db.query(Sess).get(session_id)
    if not s:
        raise HTTPException(404, "세션을 찾을 수 없습니다.")
    return {
        "id": s.id,
        "date": s.date.isoformat(),
        "start_time": s.start_time.isoformat(),
        "end_time": s.end_time.isoformat(),
        "counselor_id": s.counselor_id,
        "branch": s.branch,
        "team": s.team,
        "student_name": s.student_name,
        "requested_subject_id": s.requested_subject_id,
        "registered_subject_id": s.registered_subject_id,
        "mode": s.mode,
        "status": s.status,
        "cancel_reason": s.cancel_reason,
        "comment": s.comment
    }

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
        student_name=payload.student_name,
        requested_subject_id=payload.requested_subject_id,
        registered_subject_id=payload.registered_subject_id,
        mode=payload.mode, status=payload.status, cancel_reason=payload.cancel_reason,
        comment=payload.comment
    )
    db.add(s); db.commit(); db.refresh(s)
    return {"id": s.id}

@router.put("/{session_id}")
def update_session(session_id: int, payload: SessionUpdate, db: Session = Depends(get_db)):
    s = db.query(Sess).get(session_id)
    if not s:
        raise HTTPException(404, "세션을 찾을 수 없습니다.")

    new = {
        "date": payload.date or s.date,
        "start_time": payload.start_time or s.start_time,
        "end_time": payload.end_time or s.end_time,
        "counselor_id": payload.counselor_id or s.counselor_id,
        "branch": payload.branch or s.branch,
        "team": payload.team or s.team,
        "student_name": payload.student_name if payload.student_name is not None else s.student_name,
        "requested_subject_id": payload.requested_subject_id if payload.requested_subject_id is not None else s.requested_subject_id,
        "registered_subject_id": payload.registered_subject_id if payload.registered_subject_id is not None else s.registered_subject_id,
        "mode": payload.mode or s.mode,
        "status": payload.status or s.status,
        "cancel_reason": payload.cancel_reason if payload.cancel_reason is not None else s.cancel_reason,
        "comment": payload.comment if payload.comment is not None else s.comment
    }

    if new["status"] not in STATUSES:
        raise HTTPException(400, "유효하지 않은 상태입니다.")
    if new["mode"] not in MODES:
        raise HTTPException(400, "유효하지 않은 비대면/오프라인 값입니다.")
    if not is_30min_grid(new["start_time"]) or not is_30min_grid(new["end_time"]):
        raise HTTPException(400, "시작/종료 시각은 30분 단위여야 합니다.")
    if new["end_time"] <= new["start_time"]:
        raise HTTPException(400, "종료 시각은 시작 시각보다 커야 합니다.")

    cons = db.query(Counselor).filter(Counselor.id == new["counselor_id"]).first()
    if not cons:
        raise HTTPException(404, "상담사를 찾을 수 없습니다.")
    if check_overlap(db, counselor_id=new["counselor_id"], date=new["date"],
                     start_time=new["start_time"], end_time=new["end_time"], ignore_id=session_id):
        raise HTTPException(400, "동일 상담사의 시간이 겹칩니다.")
    try:
        validate_branch_team(db, branch=new["branch"], team=new["team"])
        enforce_conditionals(status=new["status"],
                             registered_subject_id=new["registered_subject_id"],
                             cancel_reason=new["cancel_reason"])
        branch_subject_guard(db, branch=new["branch"],
                             requested_subject_id=new["requested_subject_id"],
                             registered_subject_id=new["registered_subject_id"])
    except ValueError as e:
        raise HTTPException(400, str(e))

    s.date = new["date"]; s.start_time = new["start_time"]; s.end_time = new["end_time"]
    s.counselor_id = new["counselor_id"]; s.branch = new["branch"]; s.team = new["team"]
    s.student_name = new["student_name"]
    s.requested_subject_id = new["requested_subject_id"]; s.registered_subject_id = new["registered_subject_id"]
    s.mode = new["mode"]; s.status = new["status"]; s.cancel_reason = new["cancel_reason"]; s.comment = new["comment"]
    db.commit(); db.refresh(s)
    return {"ok": True}

@router.delete("/{session_id}")
def delete_session(session_id: int, db: Session = Depends(get_db)):
    s = db.query(Sess).get(session_id)
    if not s:
        raise HTTPException(404, "세션을 찾을 수 없습니다.")
    db.delete(s); db.commit()
    return {"ok": True}

@router.post("/batch/update-status")
def batch_update_status(payload: BatchUpdatePayload, db: Session = Depends(get_db)):
    if not payload.ids:
        raise HTTPException(400, "ids가 비어 있습니다.")
    if payload.status and payload.status not in STATUSES:
        raise HTTPException(400, "유효하지 않은 상태입니다.")
    updated = 0
    for sid in payload.ids:
        s = db.query(Sess).get(sid)
        if not s:
            continue
        new_status = payload.status or s.status
        try:
            enforce_conditionals(status=new_status,
                                 registered_subject_id=(payload.registered_subject_id if payload.registered_subject_id is not None else s.registered_subject_id),
                                 cancel_reason=(payload.cancel_reason if payload.cancel_reason is not None else s.cancel_reason))
            branch_subject_guard(db, branch=s.branch,
                                 requested_subject_id=s.requested_subject_id,
                                 registered_subject_id=(payload.registered_subject_id if payload.registered_subject_id is not None else s.registered_subject_id))
        except ValueError as e:
            raise HTTPException(400, f"id={sid}: {str(e)}")
        if payload.status is not None: s.status = payload.status
        if payload.cancel_reason is not None: s.cancel_reason = payload.cancel_reason or None
        if payload.comment is not None: s.comment = payload.comment or None
        if payload.registered_subject_id is not None: s.registered_subject_id = payload.registered_subject_id
        updated += 1
    db.commit()
    return {"updated": updated}
