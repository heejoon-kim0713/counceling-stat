# app/routers/stats.py
from datetime import date, timedelta
from typing import Optional, Dict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from app.db import get_db
from app.models import Session as Sess, DailyDB, Branch, Subject

router = APIRouter()

COUNSELING_STATUSES = {"DONE", "REGISTERED", "NOT_REGISTERED"}

def _daterange_defaults(from_: Optional[date], to_: Optional[date]):
    if not from_ or not to_:
        to_ = date.today()
        from_ = to_ - timedelta(days=30)
    return from_, to_

@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    branch: Optional[str] = Query(None),  # 전체 KPI는 지점별 표를 내려주며, 필요 시 특정 지점만 필터
    team: Optional[str] = Query(None)
):
    """
    대시보드용 단일 엔드포인트
    - branches: 지점별 counseling, registered, total_db, reg_rate, counseling_rate
    - subjects: (신청 과목 기준) 과목별 counseling, registered, reg_rate
    """
    from_date, to_date = _daterange_defaults(from_date, to_date)

    # 활성 지점 목록
    branches = db.query(Branch).filter(Branch.active == True).all()
    branch_codes = [b.code for b in branches]
    if branch:
        branch_codes = [branch] if branch in branch_codes else []

    # 세션 공통 조건
    sess_q = db.query(Sess).filter(Sess.date >= from_date, Sess.date <= to_date)
    if branch:
        sess_q = sess_q.filter(Sess.branch == branch)
    if team:
        sess_q = sess_q.filter(Sess.team == team)

    # 지점별 상담 수(상담완료/등록/미등록)
    counseling_rows = (
        db.query(Sess.branch, func.count(Sess.id))
        .filter(
            Sess.date >= from_date,
            Sess.date <= to_date,
            Sess.status.in_(list(COUNSELING_STATUSES))
        )
        .group_by(Sess.branch)
    )
    if branch:
        counseling_rows = counseling_rows.filter(Sess.branch == branch)
    if team:
        counseling_rows = counseling_rows.filter(Sess.team == team)
    counseling_rows = counseling_rows.all()
    counseling_map: Dict[str, int] = {r[0]: r[1] for r in counseling_rows}

    # 지점별 등록 수(REGISTERED)
    registered_rows = (
        db.query(Sess.branch, func.count(Sess.id))
        .filter(
            Sess.date >= from_date,
            Sess.date <= to_date,
            Sess.status == "REGISTERED"
        )
        .group_by(Sess.branch)
    )
    if branch:
        registered_rows = registered_rows.filter(Sess.branch == branch)
    if team:
        registered_rows = registered_rows.filter(Sess.team == team)
    registered_rows = registered_rows.all()
    registered_map: Dict[str, int] = {r[0]: r[1] for r in registered_rows}

    # 지점별 총 DB 합(기간 합산)
    db_rows = (
        db.query(DailyDB.branch, func.coalesce(func.sum(DailyDB.db_count), 0))
        .filter(DailyDB.date >= from_date, DailyDB.date <= to_date)
        .group_by(DailyDB.branch)
        .all()
    )
    total_db_map: Dict[str, int] = {r[0]: int(r[1] or 0) for r in db_rows}

    # 지점별 KPI 조립
    branch_stats = []
    for code in branch_codes:
        counseling = counseling_map.get(code, 0)
        registered = registered_map.get(code, 0)
        total_db = total_db_map.get(code, 0)
        reg_rate = (registered / counseling) if counseling > 0 else None
        counseling_rate = (counseling / total_db) if total_db > 0 else None
        # 라벨 조회
        b = next((x for x in branches if x.code == code), None)
        branch_stats.append({
            "branch": code,
            "branch_label": (b.label_ko if b else code),
            "counseling": counseling,
            "registered": registered,
            "total_db": total_db,
            "registration_rate": reg_rate,   # 등록률
            "counseling_rate": counseling_rate  # 상담률
        })

    # 과목별 등록률(신청 과목 기준)
    # 브랜치 필터가 있으면 해당 지점 과목만, 없으면 전체 활성 과목
    subj_q = db.query(Subject).filter(Subject.active == True)
    if branch:
        subj_q = subj_q.filter(Subject.branch == branch)
    subjects = subj_q.all()
    subject_ids = [s.id for s in subjects]
    subject_name_map = {s.id: s.name for s in subjects}
    subject_branch_map = {s.id: s.branch for s in subjects}

    # 과목별 counseling count
    subj_c_rows = (
        db.query(Sess.requested_subject_id, func.count(Sess.id))
        .filter(
            Sess.date >= from_date,
            Sess.date <= to_date,
            Sess.status.in_(list(COUNSELING_STATUSES)),
            Sess.requested_subject_id.isnot(None)
        )
        .group_by(Sess.requested_subject_id)
    )
    if branch:
        subj_c_rows = subj_c_rows.filter(Sess.branch == branch)
    if team:
        subj_c_rows = subj_c_rows.filter(Sess.team == team)
    subj_c_rows = subj_c_rows.all()
    subj_c_map: Dict[int, int] = {r[0]: r[1] for r in subj_c_rows if r[0] in subject_ids}

    # 과목별 registered count
    subj_r_rows = (
        db.query(Sess.requested_subject_id, func.count(Sess.id))
        .filter(
            Sess.date >= from_date,
            Sess.date <= to_date,
            Sess.status == "REGISTERED",
            Sess.requested_subject_id.isnot(None)
        )
        .group_by(Sess.requested_subject_id)
    )
    if branch:
        subj_r_rows = subj_r_rows.filter(Sess.branch == branch)
    if team:
        subj_r_rows = subj_r_rows.filter(Sess.team == team)
    subj_r_rows = subj_r_rows.all()
    subj_r_map: Dict[int, int] = {r[0]: r[1] for r in subj_r_rows if r[0] in subject_ids}

    subject_stats = []
    for sid in subject_ids:
        c = subj_c_map.get(sid, 0)
        r = subj_r_map.get(sid, 0)
        rate = (r / c) if c > 0 else None
        subject_stats.append({
            "subject_id": sid,
            "subject_name": subject_name_map.get(sid, str(sid)),
            "branch": subject_branch_map.get(sid, ""),
            "counseling": c,
            "registered": r,
            "registration_rate": rate
        })

    # 카드용 집계(전체)
    total_counseling = sum(x["counseling"] for x in branch_stats)
    total_registered = sum(x["registered"] for x in branch_stats)
    total_db_sum = sum(x["total_db"] for x in branch_stats)
    card_branch_registration = (total_registered / total_counseling) if total_counseling > 0 else None
    card_branch_counseling = (total_counseling / total_db_sum) if total_db_sum > 0 else None
    # 과목 등록률(전체): (모든 과목 등록 합) / (모든 과목 상담 합)
    subj_c_sum = sum(x["counseling"] for x in subject_stats)
    subj_r_sum = sum(x["registered"] for x in subject_stats)
    card_subject_registration = (subj_r_sum / subj_c_sum) if subj_c_sum > 0 else None

    return {
        "range": {"from": from_date.isoformat(), "to": to_date.isoformat()},
        "branch_stats": branch_stats,
        "subject_stats": subject_stats,
        "cards": {
            "branch_registration_rate": card_branch_registration,
            "branch_counseling_rate": card_branch_counseling,
            "subject_registration_rate": card_subject_registration
        }
    }
