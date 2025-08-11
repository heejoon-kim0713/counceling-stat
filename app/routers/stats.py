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
    """
    대시보드 KPI/표 집계
    - branch_stats: 지점별 상담/등록/DB 합계와 등록률/상담률
      * 팀 필터가 있으면 상담률 분모는 DailyDBTeam(team) 합계 사용(분모가 지점과 무관하게 동일)
      * 팀 필터가 없으면 DailyDB(branch) 합계 사용(기존 방식)
    - subject_stats_request: 과목별 등록률(신청 과목 기준)
    - subject_stats_registered: 과목별 등록률(등록 과목 기준; 분자=registered_subject, 분모=해당 과목으로 신청된 상담 수)
    - cards: 세 가지 카드 + 등록 과목 기준 보조 카드
    """
    from_date, to_date = _range(from_date, to_date)

    # 활성 지점
    branches = db.query(Branch).filter(Branch.active == True).all()
    branch_codes = [b.code for b in branches]
    if branch:
        branch_codes = [branch] if branch in branch_codes else []

    # 지점별 상담 수
    counseling_q = db.query(Sess.branch, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date, Sess.status.in_(list(COUNSELING_STATUSES))
    )
    if branch:
        counseling_q = counseling_q.filter(Sess.branch == branch)
    if team:
        counseling_q = counseling_q.filter(Sess.team == team)
    counseling_rows = counseling_q.group_by(Sess.branch).all()
    counseling_map: Dict[str, int] = {r[0]: r[1] for r in counseling_rows}

    # 지점별 등록 수
    registered_q = db.query(Sess.branch, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date, Sess.status == "REGISTERED"
    )
    if branch:
        registered_q = registered_q.filter(Sess.branch == branch)
    if team:
        registered_q = registered_q.filter(Sess.team == team)
    registered_rows = registered_q.group_by(Sess.branch).all()
    registered_map: Dict[str, int] = {r[0]: r[1] for r in registered_rows}

    # 분모(DB 수): 팀 필터 유무에 따라 분기
    team_db_sum = None
    if team:
        team_db_sum = db.query(func.coalesce(func.sum(DailyDBTeam.db_count), 0)).filter(
            DailyDBTeam.date >= from_date, DailyDBTeam.date <= to_date, DailyDBTeam.team == team
        ).scalar()
        team_db_sum = int(team_db_sum or 0)

    branch_db_rows = db.query(DailyDB.branch, func.coalesce(func.sum(DailyDB.db_count), 0)).filter(
        DailyDB.date >= from_date, DailyDB.date <= to_date
    )
    if branch:
        branch_db_rows = branch_db_rows.filter(DailyDB.branch == branch)
    branch_db_rows = branch_db_rows.group_by(DailyDB.branch).all()
    branch_db_map: Dict[str, int] = {r[0]: int(r[1] or 0) for r in branch_db_rows}

    # 지점별 KPI
    branch_stats = []
    for code in branch_codes:
        counseling = counseling_map.get(code, 0)
        registered = registered_map.get(code, 0)
        # 팀 필터 있으면 팀 DB(단일 값) 사용, 없으면 지점 DB 사용
        if team and team_db_sum is not None and team_db_sum > 0:
            total_db = team_db_sum
        else:
            total_db = branch_db_map.get(code, 0)

        reg_rate = (registered / counseling) if counseling > 0 else None
        counseling_rate = (counseling / total_db) if total_db > 0 else None
        b = next((x for x in branches if x.code == code), None)
        branch_stats.append({
            "branch": code,
            "branch_label": (b.label_ko if b else code),
            "counseling": counseling,
            "registered": registered,
            "total_db": total_db,
            "registration_rate": reg_rate,
            "counseling_rate": counseling_rate
        })

    # 과목별 등록률(신청 기준: requested_subject_id)
    subj_req_q = db.query(Subject).filter(Subject.active == True)
    if branch:
        subj_req_q = subj_req_q.filter(Subject.branch == branch)
    subjects = subj_req_q.all()
    subject_ids = [s.id for s in subjects]
    subject_name = {s.id: s.name for s in subjects}
    subject_branch = {s.id: s.branch for s in subjects}

    subj_req_c_rows = db.query(Sess.requested_subject_id, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date,
        Sess.status.in_(list(COUNSELING_STATUSES)),
        Sess.requested_subject_id.isnot(None)
    )
    if branch:
        subj_req_c_rows = subj_req_c_rows.filter(Sess.branch == branch)
    if team:
        subj_req_c_rows = subj_req_c_rows.filter(Sess.team == team)
    subj_req_c_rows = subj_req_c_rows.group_by(Sess.requested_subject_id).all()
    subj_req_c_map: Dict[int, int] = {r[0]: r[1] for r in subj_req_c_rows if r[0] in subject_ids}

    subj_req_r_rows = db.query(Sess.requested_subject_id, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date,
        Sess.status == "REGISTERED",
        Sess.requested_subject_id.isnot(None)
    )
    if branch:
        subj_req_r_rows = subj_req_r_rows.filter(Sess.branch == branch)
    if team:
        subj_req_r_rows = subj_req_r_rows.filter(Sess.team == team)
    subj_req_r_rows = subj_req_r_rows.group_by(Sess.requested_subject_id).all()
    subj_req_r_map: Dict[int, int] = {r[0]: r[1] for r in subj_req_r_rows if r[0] in subject_ids}

    subject_stats_request = []
    for sid in subject_ids:
        c = subj_req_c_map.get(sid, 0)
        r = subj_req_r_map.get(sid, 0)
        rate = (r / c) if c > 0 else None
        subject_stats_request.append({
            "subject_id": sid,
            "subject_name": subject_name.get(sid, str(sid)),
            "branch": subject_branch.get(sid, ""),
            "counseling": c,
            "registered": r,
            "registration_rate": rate
        })

    # 과목별 등록률(등록 기준: registered_subject_id 기준으로 분자 집계, 분모는 '해당 과목으로 신청된 상담 수')
    subj_reg_r_rows = db.query(Sess.registered_subject_id, func.count(Sess.id)).filter(
        Sess.date >= from_date, Sess.date <= to_date,
        Sess.status == "REGISTERED",
        Sess.registered_subject_id.isnot(None)
    )
    if branch:
        subj_reg_r_rows = subj_reg_r_rows.filter(Sess.branch == branch)
    if team:
        subj_reg_r_rows = subj_reg_r_rows.filter(Sess.team == team)
    subj_reg_r_rows = subj_reg_r_rows.group_by(Sess.registered_subject_id).all()
    subj_reg_r_map: Dict[int, int] = {r[0]: r[1] for r in subj_reg_r_rows if r[0] in subject_ids}

    subject_stats_registered = []
    for sid in subject_ids:
        # 분모: 해당 과목으로 '신청'된 상담 수(상담완료/등록/미등록)
        c = subj_req_c_map.get(sid, 0)
        # 분자: 해당 과목으로 '등록'된 건수(registered_subject_id 기준)
        r = subj_reg_r_map.get(sid, 0)
        rate = (r / c) if c > 0 else None
        subject_stats_registered.append({
            "subject_id": sid,
            "subject_name": subject_name.get(sid, str(sid)),
            "branch": subject_branch.get(sid, ""),
            "counseling_by_request": c,
            "registered_by_registered": r,
            "registration_rate_registered_basis": rate
        })

    # 카드(전체)
    total_counseling = sum(x["counseling"] for x in branch_stats)
    total_registered = sum(x["registered"] for x in branch_stats)
    # 분모(전체): 팀 필터 있으면 팀 DB 합, 없으면 지점 DB 합
    if team and team_db_sum is not None:
        total_db_sum = team_db_sum
    else:
        total_db_sum = sum(x["total_db"] for x in branch_stats)
    card_branch_registration = (total_registered / total_counseling) if total_counseling > 0 else None
    card_branch_counseling = (total_counseling / total_db_sum) if total_db_sum > 0 else None

    # 과목 카드(신청 기준)
    subj_c_sum = sum(x["counseling"] for x in subject_stats_request)
    subj_r_sum = sum(x["registered"] for x in subject_stats_request)
    card_subject_registration_req = (subj_r_sum / subj_c_sum) if subj_c_sum > 0 else None

    # 보조 카드(등록 기준)
    subj_c_req_sum = sum(x["counseling_by_request"] for x in subject_stats_registered)
    subj_r_reg_sum = sum(x["registered_by_registered"] for x in subject_stats_registered)
    card_subject_registration_reg = (subj_r_reg_sum / subj_c_req_sum) if subj_c_req_sum > 0 else None

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
