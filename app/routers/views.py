from datetime import date, timedelta
from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, FileResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import and_
from pathlib import Path
from app.db import get_db
from app.models import Session as Sess, Counselor, Subject

router = APIRouter()
BASE_DIR = Path(__file__).resolve().parents[1]  # repo root
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))

@router.get("/", response_class=HTMLResponse)
def root(request: Request):
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
    if not from_date or not to_date:
        to_date = date.today()
        from_date = to_date - timedelta(days=30)

    q = db.query(Sess).filter(
        and_(Sess.date >= from_date, Sess.date <= to_date,
             Sess.status == "REGISTERED",
             Sess.requested_subject_id.isnot(None),
             Sess.registered_subject_id.isnot(None),
             Sess.requested_subject_id != Sess.registered_subject_id)
    )
    if branch: q = q.filter(Sess.branch == branch)
    if team: q = q.filter(Sess.team == team)
    if mode: q = q.filter(Sess.mode == mode)

    rows = q.order_by(Sess.date.desc(), Sess.start_time).all()

    def subj_name(sid):
        if not sid: return ""
        s = db.query(Subject).filter(Subject.id == sid).first()
        return s.name if s else ""

    items = []
    for s in rows:
        c = db.query(Counselor).get(s.counselor_id)
        items.append({
            "date": s.date.isoformat(),
            "time": f"{s.start_time.strftime('%H:%M')}~{s.end_time.strftime('%H:%M')}",
            "branch": s.branch,
            "team": s.team,
            "counselor": c.name if c else "",
            "requested": subj_name(s.requested_subject_id),
            "registered": subj_name(s.registered_subject_id),
            "mode": "비" if s.mode == "REMOTE" else "오프",
            "comment": s.comment or ""
        })

    return templates.TemplateResponse("mismatch.html", {
        "request": request,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "items": items
    })
