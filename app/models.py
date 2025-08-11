from sqlalchemy import Column, Integer, String, Date, Time, ForeignKey, Boolean, DateTime, func
from sqlalchemy.orm import relationship
from app.db import Base

# 상수값
BRANCHES = ["KH", "ATENZ", "VIDEO"]
TEAMS = ["JONGNO", "DANGSAN", "GANGNAM1", "GANGNAM2"]
STATUSES = ["PENDING", "DONE", "REGISTERED", "NOT_REGISTERED", "CANCELED"]
CANCEL_REASONS = ["PERSONAL", "OTHER_INSTITUTE", "NO_ANSWER", "RESCHEDULE"]
MODES = ["REMOTE", "OFFLINE"]  # UI 표기: 비/오프

class Counselor(Base):
    __tablename__ = "counselors"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    branch = Column(String, nullable=False)  # KH/ATENZ/VIDEO
    team = Column(String, nullable=False)    # JONGNO/DANGSAN/GANGNAM1/GANGNAM2
    hired_at = Column(Date, nullable=True)
    left_at = Column(Date, nullable=True)
    status = Column(String, default="ACTIVE")  # ACTIVE/INACTIVE
    sessions = relationship("Session", back_populates="counselor")

class Subject(Base):
    __tablename__ = "subjects"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    branch = Column(String, nullable=False)
    active = Column(Boolean, default=True)

class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    counselor_id = Column(Integer, ForeignKey("counselors.id"), nullable=False)
    branch = Column(String, nullable=False)
    team = Column(String, nullable=False)

    requested_subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)
    registered_subject_id = Column(Integer, ForeignKey("subjects.id"), nullable=True)

    mode = Column(String, default="OFFLINE")  # REMOTE/OFFLINE
    status = Column(String, default="PENDING")  # PENDING/DONE/REGISTERED/NOT_REGISTERED/CANCELED
    cancel_reason = Column(String, nullable=True)
    comment = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    counselor = relationship("Counselor", back_populates="sessions")
    requested_subject = relationship("Subject", foreign_keys=[requested_subject_id])
    registered_subject = relationship("Subject", foreign_keys=[registered_subject_id])

class DailyDB(Base):
    __tablename__ = "
