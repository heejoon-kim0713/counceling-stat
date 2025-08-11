from sqlalchemy.orm import Session
from app.models import Branch, Team

MODE_LABELS = {"REMOTE": "비", "OFFLINE": "오프"}

def branch_label(db: Session, code: str) -> str:
    if not code: return ""
    row = db.query(Branch).filter(Branch.code == code).first()
    return row.label_ko if row else code

def team_label(db: Session, code: str) -> str:
    if not code: return ""
    row = db.query(Team).filter(Team.code == code).first()
    return row.label_ko if row else code

def mode_label(code: str) -> str:
    return MODE_LABELS.get(code, code or "")
