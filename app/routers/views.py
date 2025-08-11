# app/routers/views.py
from datetime import date, timedelta
from pathlib import Path

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Session as Sess, Counselor, Subject
from app.services.labels import branch_label, team_label, mode_label

router = APIRouter()

# repo root (…/app/routers/views.py 기준 상위 두 단계)
BASE_DIR = Path(__file__).resolve().parents[1]
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))

@router.get("/", response_class=HTMLResponse)
def root(request: Request):
    """루트 접근 시: 리포 루트의 index.html이 있으면 그대로 서빙, 없으면 대시보드로 이동"""
    index_file = BASE_DIR / "index.html"
    if index_file.exists():
        return FileResponse(str(index_file))
    return RedirectResponse(url="/dashboard")

@router.get("/dashboard", response_class=HTMLResponse)
def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})

@router.get("/calendar/weekly", response_class=HTMLResponse)
def calendar_week(request: Request):
    return templates.TemplateResponse("calendar_week.html", {"request": request})

@router.get("/mismatch", response_class=HTMLResponse)
def mismatch_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    branch: str | None = Query(None),
    team: str | None = Query(None),
    mode: str | None = Query(None),
):
    """
    과목 불일치 분석 페이지
    - 기본 기간: 최근 30일
    - 조건: status=REGISTERED AND 신청 과목 입력됨 AND 신청≠등록
    - 지점/팀/모드 필터 지원
    - 한글 라벨: 지점/팀/모드에 DB 기반 라벨 적용
    """
    if not from_date or not to_date:
        to_date = date.today()
        from_date = to_date - timedelta(days=30)

    q = db.query(Sess).filter(
        and_(
            Sess.date >= from_date,
            Sess.date <= to_date,
            Sess.status == "REGISTERED",
            Sess.requested_subject_id.isnot(None),
            Sess.registered_subject_id.isnot(None),
            Sess.requested_subject_id != Sess.registered_subject_id,
        )
    )
    if branch:
        q = q.filter(Sess.branch == branch)
    if team:
        q = q.filter(Sess.team == team)
    if mode:
        q = q.filter(Sess.mode == mode)

    rows = q.order_by(Sess.date.desc(), Sess.start_time).all()

    def subj_name(subj_id: int | None) -> str:
        if not subj_id:
            return ""
        s = db.query(Subject).filter(Subject.id == subj_id).first()
        return s.name if s else ""

    items = []
    for s in rows:
        counselor = db.query(Counselor).get(s.counselor_id) if s.counselor_id else None
        items.append({
            "date": s.date.isoformat(),
            "time": f"{s.start_time.strftime('%H:%M')}~{s.end_time.strftime('%H:%M')}",
            "branch": branch_label(db, s.branch),  # 한글 라벨
            "team": team_label(db, s.team),        # 한글 라벨
            "counselor": counselor.name if counselor else "",
            "requested": subj_name(s.requested_subject_id),
            "registered": subj_name(s.registered_subject_id),
            "mode": mode_label(s.mode),            # 비/오프
            "comment": s.comment or ""
        })

    return templates.TemplateResponse("mismatch.html", {
        "request": request,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "items": items
    })

@router.get("/admin/meta", response_class=HTMLResponse)
def admin_meta(request: Request):
    """
    메타 관리(지점/팀) 페이지
    - /api/meta/branches, /api/meta/teams API와 연동
    - 추가/수정, 활성/비활성 토글 지원
    """
    return templates.TemplateResponse("admin_meta.html", {"request": request})
