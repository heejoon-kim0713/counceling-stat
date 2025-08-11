# app/routers/stats.py
from datetime import date, timedelta
from typing import Optional, Dict
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.db import get_db
from app.models import Session as Sess, DailyDB, DailyDBTeam, Branch, Subject

router = APIRouter()
COUNSELING_STATUSES = {"DONE", "REGISTERED", "NOT_REGISTERED"}

def _range(from_: Optional[date], to_: Optional[date]):
    if not from_ or not to_:
        to_ = date.today()
        from_ = to_ - timedelta(days=30)
    return from_, to_

@router.get("/overview")
def overview(
    db: Session = Depends(get_db),
    from_date: Optional[date] = Query(None),
    to_date: Optional[date] = Query(None),
    branch: Optional[str] = Query(None),
    team: Optional[str] = Query(None)
):
    from_date, to_date = _range(from_date, to_date)

    # 지점 라벨 맵
    branches = db.query(Branch).filter(Branch.active == True).all()
    branch_codes = [b.code for b in branches]
    label_of_branch = {b.code: b.label_ko for b in branches}
    if branch:
        branch_codes = [branch] if branch in branch_codes else []

    # 지점별 상담/등록
    counseling_q = db.query(Sess.branch, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date, Sess.status.in_(list(COUNSELING_STATUSES))
    )
    if branch: counseling_q = counseling_q.filter(Sess.branch == branch)
    if team: counseling_q = counseling_q.filter(Sess.team == team)
    counseling_map = {r[0]: r[1] for r in counseling_q.group_by(Sess.branch).all()}

    registered_q = db.query(Sess.branch, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date, Sess.status == "REGISTERED"
    )
    if branch: registered_q = registered_q.filter(Sess.branch == branch)
    if team: registered_q = registered_q.filter(Sess.team == team)
    registered_map = {r[0]: r[1] for r in registered_q.group_by(Sess.branch).all()}

    # 분모(DB 수): 팀 필터 유/무
    team_db_sum = None
    if team:
        team_db_sum = db.query(func.coalesce(func.sum(DailyDBTeam.db_count), 0)).filter(
            DailyDBTeam.date >= from_date, DailyDBTeam.date <= to_date, DailyDBTeam.team == team
        ).scalar()
        team_db_sum = int(team_db_sum or 0)

    branch_db_rows = db.query(DailyDB.branch, func.coalesce(func.sum(DailyDB.db_count), 0)).filter(
        DailyDB.date >= from_date, DailyDB.date <= to_date
    )
    if branch: branch_db_rows = branch_db_rows.filter(DailyDB.branch == branch)
    branch_db_map = {r[0]: int(r[1] or 0) for r in branch_db_rows.group_by(DailyDB.branch).all()}

    branch_stats = []
    for code in branch_codes:
        counseling = counseling_map.get(code, 0)
        registered = registered_map.get(code, 0)
        total_db = team_db_sum if (team and team_db_sum is not None and team_db_sum > 0) else branch_db_map.get(code, 0)
        reg_rate = (registered / counseling) if counseling > 0 else None
        counseling_rate = (counseling / total_db) if total_db > 0 else None
        branch_stats.append({
            "branch": code,
            "branch_label": label_of_branch.get(code, code),
            "counseling": counseling,
            "registered": registered,
            "total_db": total_db,
            "registration_rate": reg_rate,
            "counseling_rate": counseling_rate
        })

    # 과목별 등록률(신청 기준)
    subj_q = db.query(Subject).filter(Subject.active == True)
    if branch: subj_q = subj_q.filter(Subject.branch == branch)
    subjects = subj_q.all()
    subject_ids = [s.id for s in subjects]
    subj_name = {s.id: s.name for s in subjects}
    subj_branch = {s.id: s.branch for s in subjects}
    subj_branch_label = {s.id: label_of_branch.get(s.branch, s.branch) for s in subjects}

    req_c_rows = db.query(Sess.requested_subject_id, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date,
        Sess.status.in_(list(COUNSELING_STATUSES)),
        Sess.requested_subject_id.isnot(None)
    )
    if branch: req_c_rows = req_c_rows.filter(Sess.branch == branch)
    if team: req_c_rows = req_c_rows.filter(Sess.team == team)
    req_c_map = {r[0]: r[1] for r in req_c_rows.group_by(Sess.requested_subject_id).all() if r[0] in subject_ids}

    req_r_rows = db.query(Sess.requested_subject_id, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date,
        Sess.status == "REGISTERED",
        Sess.requested_subject_id.isnot(None)
    )
    if branch: req_r_rows = req_r_rows.filter(Sess.branch == branch)
    if team: req_r_rows = req_r_rows.filter(Sess.team == team)
    req_r_map = {r[0]: r[1] for r in req_r_rows.group_by(Sess.requested_subject_id).all() if r[0] in subject_ids}

    subject_stats_request = []
    for sid in subject_ids:
        c = req_c_map.get(sid, 0)
        r = req_r_map.get(sid, 0)
        subject_stats_request.append({
            "subject_id": sid,
            "subject_name": subj_name.get(sid, str(sid)),
            "branch": subj_branch.get(sid, ""),
            "branch_label": subj_branch_label.get(sid, subj_branch.get(sid, "")),
            "counseling": c,
            "registered": r,
            "registration_rate": (r / c) if c > 0 else None
        })

    # 과목별 등록률(등록 기준 보조)
    reg_r_rows = db.query(Sess.registered_subject_id, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date,
        Sess.status == "REGISTERED",
        Sess.registered_subject_id.isnot(None)
    )
    if branch: reg_r_rows = reg_r_rows.filter(Sess.branch == branch)
    if team: reg_r_rows = reg_r_rows.filter(Sess.team == team)
    reg_r_map = {r[0]: r[1] for r in reg_r_rows.group_by(Sess.registered_subject_id).all() if r[0] in subject_ids}

    subject_stats_registered = []
    for sid in subject_ids:
        c = req_c_map.get(sid, 0)  # 분모: 신청 과목으로 상담 수
        r = reg_r_map.get(sid, 0)  # 분자: 등록 과목으로 등록 수
        subject_stats_registered.append({
            "subject_id": sid,
            "subject_name": subj_name.get(sid, str(sid)),
            "branch": subj_branch.get(sid, ""),
            "branch_label": subj_branch_label.get(sid, subj_branch.get(sid, "")),
            "counseling_by_request": c,
            "registered_by_registered": r,
            "registration_rate_registered_basis": (r / c) if c > 0 else None
        })

    # 카드
    total_counseling = sum(x["counseling"] for x in branch_stats)
    total_registered = sum(x["registered"] for x in branch_stats)
    total_db_sum = (team_db_sum if (team and team_db_sum is not None) else sum(x["total_db"] for x in branch_stats))
    card_branch_registration = (total_registered / total_counseling) if total_counseling > 0 else None
    card_branch_counseling = (total_counseling / total_db_sum) if total_db_sum > 0 else None

    subj_req_c_sum = sum(x["counseling"] for x in subject_stats_request)
    subj_req_r_sum = sum(x["registered"] for x in subject_stats_request)
    card_subject_registration_req = (subj_req_r_sum / subj_req_c_sum) if subj_req_c_sum > 0 else None

    subj_reg_c_sum = sum(x["counseling_by_request"] for x in subject_stats_registered)
    subj_reg_r_sum = sum(x["registered_by_registered"] for x in subject_stats_registered)
    card_subject_registration_reg = (subj_reg_r_sum / subj_reg_c_sum) if subj_reg_c_sum > 0 else None

    return {
        "range": {"from": from_date.isoformat(), "to": to_date.isoformat()},
        "branch_stats": branch_stats,
        "subject_stats_request": subject_stats_request,
        "subject_stats_registered": subject_stats_registered,
        "cards": {
            "branch_registration_rate": card_branch_registration,
            "branch_counseling_rate": card_branch_counseling,
            "subject_registration_rate_request_basis": card_subject_registration_req,
            "subject_registration_rate_registered_basis": card_subject_registration_reg
        }
    }
