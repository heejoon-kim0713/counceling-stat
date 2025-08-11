from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from app.db import Base, engine, SessionLocal
from app.models import Subject, Counselor
from app.routers import views, subjects, counselors, sessions, daily_db

app = FastAPI(title="상담 스케줄러")

# 정적 파일: 리포 루트를 /static으로 마운트(루트의 style.css, script.js 접근)
app.mount("/static", StaticFiles(directory="."), name="static")

# 라우터 등록
app.include_router(views.router, tags=["views"])
app.include_router(subjects.router, prefix="/api/subjects", tags=["subjects"])
app.include_router(counselors.router, prefix="/api/counselors", tags=["counselors"])
app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
app.include_router(daily_db.router, prefix="/api/daily-db", tags=["daily-db"])

@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    seed_data()

def seed_data():
    db: Session = SessionLocal()
    try:
        # 과목 시드(지점별)
        seeds = [
            ("자바","KH"),("보안","KH"),("클라우드","KH"),("빅데이터","KH"),
            ("프로그래밍","ATENZ"),("기획","ATENZ"),("원화","ATENZ"),("3D그래픽","ATENZ"),
            ("포토/일러","VIDEO"),("기본영상편집","VIDEO"),("모션그래픽","VIDEO"),
            ("maya","VIDEO"),("VFX","VIDEO"),("유튜브","VIDEO"),
        ]
        for name, branch in seeds:
            exists = db.query(Subject).filter(Subject.name==name, Subject.branch==branch).first()
            if not exists:
                db.add(Subject(name=name, branch=branch, active=True))

        # 상담사 샘플(지점/팀 다양)
        if db.query(Counselor).count() == 0:
            db.add_all([
                Counselor(name="김상담", branch="KH", team="JONGNO"),
                Counselor(name="이코치", branch="ATENZ", team="GANGNAM1"),
                Counselor(name="박가이드", branch="VIDEO", team="DANGSAN"),
            ])
        db.commit()
    finally:
        db.close()

@app.get("/health")
def health():
    return {"status": "ok"}
