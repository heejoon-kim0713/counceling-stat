from datetime import time
from sqlalchemy.orm import Session
from sqlalchemy import and_
from app.models import Session as Sess, Subject, Branch, Team

def is_30min_grid(t: time) -> bool:
    return t.minute in (0, 30) and t.second == 0 and t.microsecond == 0

def check_overlap(db: Session, *, counselor_id: int, date, start_time, end_time, ignore_id=None) -> bool:
    q = db.query(Sess).filter(Sess.counselor_id == counselor_id, Sess.date == date)
    if ignore_id:
        q = q.filter(Sess.id != ignore_id)
    overlap = q.filter(and_(start_time < Sess.end_time, end_time > Sess.start_time)).first()
    return overlap is not None

def enforce_conditionals(*, status: str, registered_subject_id, cancel_reason):
    if status == "REGISTERED" and not registered_subject_id:
        raise ValueError("등록 상태에서는 ‘등록 과목’이 필수입니다.")
    if status == "CANCELED" and not cancel_reason:
        raise ValueError("상담취소 상태에서는 ‘취소 사유’가 필수입니다.")

def branch_subject_guard(db: Session, *, branch: str, requested_subject_id, registered_subject_id):
    for sid in (requested_subject_id, registered_subject_id):
        if sid:
            subj = db.query(Subject).filter(Subject.id == sid).first()
            if (not subj) or subj.branch != branch:
                raise ValueError("과목은 해당 지점의 목록에서만 선택할 수 있습니다.")

def validate_branch_team(db: Session, *, branch: str, team: str):
    if not db.query(Branch).filter(Branch.code == branch, Branch.active == True).first():
        raise ValueError("등록되지 않은 지점 코드입니다.")
    if not db.query(Team).filter(Team.code == team, Team.active == True).first():
        raise ValueError("등록되지 않은 팀 코드입니다.")
