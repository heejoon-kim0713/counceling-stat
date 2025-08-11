from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import os

app = FastAPI(title="상담 스케줄러(정적 서빙 MVP)")

# 정적 파일 서빙: 리포 루트의 index.html, style.css, script.js를 그대로 사용
app.mount("/static", StaticFiles(directory="."), name="static")

@app.get("/")
def root():
    index_path = os.path.join(".", "index.html")
    return FileResponse(index_path)
