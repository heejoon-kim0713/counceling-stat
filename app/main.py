from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.db import Base, engine, SessionLocal
from app.models import Subject, Counselor, Branch, Team
from app.routers import views, subjects, counselors, sessions, daily_db, meta

app = FastAPI(title="상담 스케줄러")

app.mount("/static", StaticFiles(directory="."), name="static")

app.include_router(views.router, tags=["views"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(counselors.router, prefix="/api/counselors", tags=["counselors"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(daily_db.router, prefix="/api/daily-db", tags=["daily-db"])
app.include_router(meta.router, prefix="/api/meta", tags=["meta"])

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    seed_data()

def seed_data():
    db: Session = SessionLocal()
    try:
        # 지점 시드
        for code, label in [("KH","KH"), ("ATENZ","아텐츠"), ("VIDEO","영상")]:
            if not db.query(Branch).filter(Branch.code==code).first():
                db.add(Branch(code=code, label_ko=label, active=True))

        # 팀 시드
        for code, label in [("JONGNO","종로"), ("DANGSAN","당산"), ("GANGNAM1","강남 1팀"), ("GANGNAM2","강남 2팀")]:
            if not db.query(Team).filter(Team.code==code).first():
                db.add(Team(code=code, label_ko=label, active=True))

        # 과목 시드(지점별)
        seeds = [
            ("자바","KH"),("보안","KH"),("클라우드","KH"),("빅데이터","KH"),
            ("프로그래밍","ATENZ"),("기획","ATENZ"),("원화","ATENZ"),("3D그래픽","ATENZ"),
            ("포토/일러","VIDEO"),("기본영상편집","VIDEO"),("모션그래픽","VIDEO"),
            ("maya","VIDEO"),("VFX","VIDEO"),("유튜브","VIDEO"),
        ]
        for name, branch in seeds:
            if not db.query(Subject).filter(Subject.name==name, Subject.branch==branch).first():
                db.add(Subject(name=name, branch=branch, active=True))

        # 상담사 샘플(존재 없을 때만)
        if db.query(Counselor).count() == 0:
            db.add_all([
                Counselor(name="김상담", branch="KH",    team="JONGNO"),
                Counselor(name="이코치", branch="ATENZ", team="GANGNAM1"),
                Counselor(name="박가이드", branch="VIDEO", team="DANGSAN"),
            ])
        db.commit()
    finally:
        db.close()

@app.get("/health")
def health():
    return {"status": "ok"}
