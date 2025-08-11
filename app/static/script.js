// app/static/script.js
// 주간 캘린더 스크립트

// 기본 설정
const SLOT_MIN = 30;       // 30분 그리드
const DAY_START = 9 * 60;  // 09:00 (분)
const DAY_END = 21 * 60;   // 21:00 (분)
const SLOT_HEIGHT = 24;    // 30분당 높이(px)

// 전역 상태
const State = {
  branches: [],
  teams: [],
  counselors: [],
  subjectsByBranch: new Map(), // branch -> [{id,name}]
  weekStart: null, // Date (월요일)
  filter: {
    branch: "",
    team: "",
    counselorId: "",
    mode: ""
  },
  sessions: [] // API에서 로드한 세션
};

// 유틸
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
const toDateInput = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fromDateInput = (s) => { const [y,m,dd]=s.split("-"); return new Date(+y, +m-1, +dd); };
const clampToGrid = (minutes) => {
  // 30분 단위 반올림(내림)
  return Math.floor(minutes / SLOT_MIN) * SLOT_MIN;
};
const addMinutes = (d, min) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0+min);

// 초기 진입: /calendar/weekly 에서만 실행
document.addEventListener("DOMContentLoaded", () => {
  const calEl = $("#calendar");
  if (!calEl) return; // 다른 페이지는 무시

  initToolbar();
  initModal();
  initTimeScale();
  initDayColumns();
  loadMeta().then(() => {
    autoSetWeekStart();
    refreshFilters();
    loadAndRender();
  });
});

// 메타 로딩
async function loadMeta() {
  // 지점
  State.branches = await fetch("/api/meta/branches").then(r=>r.json());
  // 팀
  State.teams = await fetch("/api/meta/teams").then(r=>r.json());
  // 상담사
  State.counselors = await fetch("/api/counselors").then(r=>r.json());
}

// 과목 로딩(지점별 캐시)
async function ensureSubjects(branch) {
  if (!branch) return [];
  if (State.subjectsByBranch.has(branch)) return State.subjectsByBranch.get(branch);
  const list = await fetch(`/api/subjects?branch=${encodeURIComponent(branch)}`).then(r=>r.json());
  State.subjectsByBranch.set(branch, list);
  return list;
}

// 툴바 초기화
function initToolbar() {
  $("#btn-prev-week").addEventListener("click", () => {
    State.weekStart = addMinutes(State.weekStart, -7*24*60);
    $("#week-start").value = toDateInput(State.weekStart);
    loadAndRender();
  });
  $("#btn-next-week").addEventListener("click", () => {
    State.weekStart = addMinutes(State.weekStart, 7*24*60);
    $("#week-start").value = toDateInput(State.weekStart);
    loadAndRender();
  });
  $("#week-start").addEventListener("change", (e) => {
    const d = fromDateInput(e.target.value);
    State.weekStart = startOfWeek(d);
    e.target.value = toDateInput(State.weekStart);
    loadAndRender();
  });

  $("#filter-branch").addEventListener("change", async (e)=>{
    State.filter.branch = e.target.value;
    // 팀/과목 의존 초기화
    refreshTeamFilter();
    await loadAndRender();
  });
  $("#filter-team").addEventListener("change", (e)=>{
    State.filter.team = e.target.value;
    loadAndRender();
  });
  $("#filter-counselor").addEventListener("change", (e)=>{
    State.filter.counselorId = e.target.value;
    loadAndRender();
  });
  $("#filter-mode").addEventListener("change", (e)=>{
    State.filter.mode = e.target.value;
    loadAndRender();
  });
}

// 필터 UI 갱신
function refreshFilters() {
  // 지점
  const bSel = $("#filter-branch");
  bSel.innerHTML = `<option value="">지점 전체</option>` + State.branches
    .filter(b=>b.active)
    .map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");

  // 팀(지점 독립)
  refreshTeamFilter();

  // 상담사
  const cSel = $("#filter-counselor");
  cSel.innerHTML = `<option value="">상담사 전체</option>` + State.counselors
    .map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");
}

// 팀 필터만 별도 분리(지점 무관)
function refreshTeamFilter() {
  const tSel = $("#filter-team");
  tSel.innerHTML = `<option value="">팀 전체</option>` + State.teams
    .filter(t=>t.active)
    .map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
}

// 주차 자동 설정(오늘 기준 주 월요일)
function autoSetWeekStart() {
  const today = new Date();
  State.weekStart = startOfWeek(today);
  $("#week-start").value = toDateInput(State.weekStart);
}

// 주 시작(월요일)
function startOfWeek(d) {
  const day = d.getDay(); // 0=일
  const diff = (day === 0 ? -6 : 1 - day); // 월=1
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0,0,0,0);
  return monday;
}

// 시간 눈금
function initTimeScale() {
  const scale = $("#time-scale");
  scale.innerHTML = "";
  for (let m = DAY_START; m <= DAY_END; m += SLOT_MIN) {
    const t = document.createElement("div");
    t.className = "time-slot";
    const hh = Math.floor(m/60), mm = m%60;
    t.textContent = `${pad2(hh)}:${pad2(mm)}`;
    t.style.height = SLOT_HEIGHT+"px";
    scale.appendChild(t);
  }
}

// 요일 컬럼 초기화(헤더/바디)
function initDayColumns() {
  const headerCols = $$("#calendar .cal-header .day-col");
  const bodyCols = $$("#calendar .cal-body .day-col.body");

  // 헤더 날짜 라벨
  headerCols.forEach((col, idx) => {
    col.innerHTML = `<div class="day-label" id="day-label-${idx}"></div>`;
  });

  // 바디 클릭 핸들러(새 일정)
  bodyCols.forEach((col, idx) => {
    col.addEventListener("click", (e)=>{
      const rect = col.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const minutesFromStart = Math.max(0, Math.min(DAY_END-DAY_START, Math.round(y / SLOT_HEIGHT) * SLOT_MIN));
      const startMin = DAY_START + minutesFromStart;
      const endMin = Math.min(DAY_END, startMin + 60); // 기본 1시간

      const dayDate = addMinutes(State.weekStart, idx*24*60);
      const dateStr = toDateInput(dayDate);
      const startStr = `${pad2(Math.floor(startMin/60))}:${pad2(startMin%60)}`;
      const endStr = `${pad2(Math.floor(endMin/60))}:${pad2(endMin%60)}`;

      openModal({
        id: "",
        date: dateStr,
        start_time: startStr,
        end_time: endStr,
        counselor_id: "",
        branch: State.filter.branch || "",
        team: State.filter.team || "",
        mode: State.filter.mode || "OFFLINE",
        status: "PENDING",
        requested_subject_id: "",
        registered_subject_id: "",
        cancel_reason: "",
        comment: ""
      }, "create");
    });
  });
}

// 주간 세션 로딩/렌더
async function loadAndRender() {
  // 헤더 날짜 표기
  for (let i=0;i<7;i++){
    const d = addMinutes(State.weekStart, i*24*60);
    const label = $("#day-label-"+i);
    const w = ["월","화","수","목","금","토","일"][i];
    label.textContent = `${w} ${d.getMonth()+1}/${d.getDate()}`;
  }

  const from = toDateInput(State.weekStart);
  const to = toDateInput(addMinutes(State.weekStart, 6*24*60));
  const params = new URLSearchParams({ from_date: from, to_date: to });
  if (State.filter.branch) params.append("branch", State.filter.branch);
  if (State.filter.team) params.append("team", State.filter.team);
  if (State.filter.counselorId) params.append("counselor_id", State.filter.counselorId);
  if (State.filter.mode) params.append("mode", State.filter.mode);

  State.sessions = await fetch("/api/sessions?"+params.toString()).then(r=>r.json());
  renderWeek();
}

// 주간 렌더링
function renderWeek() {
  // 컬럼 초기화
  $$("#calendar .cal-body .day-col.body").forEach(col => col.innerHTML = "");

  // 날짜별 그룹
  const map = new Map(); // "YYYY-MM-DD" -> []
  for (const s of State.sessions) {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s);
  }

  for (let i=0;i<7;i++){
    const dayDate = addMinutes(State.weekStart, i*24*60);
    const key = toDateInput(dayDate);
    const list = (map.get(key) || []).slice().sort((a,b)=>a.start_time.localeCompare(b.start_time));
    const col = $(`#calendar .cal-body .day-col.body[data-day="${i}"]`);
    col.style.position = "relative";
    col.style.height = ((DAY_END-DAY_START)/SLOT_MIN)*SLOT_HEIGHT + "px";

    for (const ev of list) {
      const top = posTopPx(ev.start_time);
      const height = heightPx(ev.start_time, ev.end_time);
      const color = statusColor(ev.status);
      const el = document.createElement("div");
      el.className = "event";
      el.style.top = top + "px";
      el.style.height = Math.max(20, height) + "px";
      el.style.background = color.bg;
      el.style.borderColor = color.border;
      el.title = tooltipText(ev);

      el.innerHTML = `
        <div class="ev-time">${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)}</div>
        <div class="ev-title">#${ev.counselor_id} ${ev.status}</div>
      `;
      el.addEventListener("click", (e)=>{
        e.stopPropagation();
        openModal(ev, "edit");
      });
      col.appendChild(el);
    }
  }
}

function posTopPx(hhmm) {
  const [hh,mm]=hhmm.split(":").map(Number);
  const minFromStart = (hh*60+mm) - DAY_START;
  return (minFromStart / SLOT_MIN) * SLOT_HEIGHT;
}
function heightPx(start, end) {
  const [h1,m1]=start.split(":").map(Number);
  const [h2,m2]=end.split(":").map(Number);
  const dur = (h2*60+m2)-(h1*60+m1);
  return (dur / SLOT_MIN) * SLOT_HEIGHT - 2;
}
function statusColor(status){
  switch(status){
    case "PENDING": return {bg:"#e5e7eb", border:"#d1d5db"};        // 회색
    case "REGISTERED": return {bg:"#dbeafe", border:"#93c5fd"};     // 파랑
    case "NOT_REGISTERED": return {bg:"#fde68a", border:"#f59e0b"}; // 주황
    case "DONE": return {bg:"#d1fae5", border:"#34d399"};           // 초록
    case "CANCELED": return {bg:"#fecaca", border:"#f87171"};       // 빨강
    default: return {bg:"#e5e7eb", border:"#d1d5db"};
  }
}
function tooltipText(ev){
  return `상담사ID: ${ev.counselor_id}\n지점:${ev.branch} 팀:${ev.team}\n상태:${ev.status}\n${ev.start_time}~${ev.end_time}`;
}

// 모달 ------------------------------------
function initModal(){
  $("#modal-close").addEventListener("click", closeModal);
  $("#btn-save").addEventListener("click", onSave);
  $("#btn-delete").addEventListener("click", onDelete);

  // 상담사 선택 시 지점/팀 자동 채움
  $("#form-counselor").addEventListener("change", (e)=>{
    const id = +e.target.value;
    const found = State.counselors.find(c=>c.id===id);
    if (found){
      $("#form-branch").value = found.branch;
      $("#form-team").value = found.team;
      refreshSubjects(found.branch);
    }
  });

  // 지점 변경 시 과목 드롭다운 갱신
  $("#form-branch").addEventListener("change", async (e)=>{
    await refreshSubjects(e.target.value);
  });

  // 상태에 따른 필수/가시성
  $("#form-status").addEventListener("change", ()=>{
    refreshConditionalFields();
  });
}

async function openModal(ev, mode){
  // 제목/버튼
  $("#modal-title").textContent = mode === "create" ? "새 일정" : "일정 편집";
  $("#btn-delete").style.display = (mode === "edit") ? "inline-block" : "none";

  // 폼 채우기
  $("#form-id").value = ev.id || "";
  $("#form-date").value = ev.date || "";
  $("#form-start").value = (ev.start_time || "09:00").slice(0,5);
  $("#form-end").value = (ev.end_time || "10:00").slice(0,5);

  // 상담사/지점/팀/모드/상태/과목/코멘트
  // 드롭다운 구성
  await buildFormSelects();

  $("#form-counselor").value = ev.counselor_id || "";
  $("#form-branch").value = ev.branch || "";
  $("#form-team").value = ev.team || "";
  $("#form-mode").value = ev.mode || "OFFLINE";
  $("#form-status").value = ev.status || "PENDING";
  $("#form-comment").value = ev.comment || "";

  // 과목 드롭다운은 지점 기준
  if (ev.branch) {
    await refreshSubjects(ev.branch);
  } else {
    $("#form-requested").innerHTML = `<option value="">선택</option>`;
    $("#form-registered").innerHTML = `<option value="">선택</option>`;
  }

  $("#form-requested").value = ev.requested_subject_id || "";
  $("#form-registered").value = ev.registered_subject_id || "";

  refreshConditionalFields();
  $("#modal").classList.remove("hidden");
}

function closeModal(){
  $("#modal").classList.add("hidden");
}

function refreshConditionalFields(){
  const status = $("#form-status").value;
  // 등록이면 등록 과목 필수
  $("#form-registered").parentElement.style.display = (status==="REGISTERED") ? "block":"block";
  // 취소면 사유 필수
  $("#form-cancel").parentElement.style.display = (status==="CANCELED") ? "block":"none";
}

// 폼 셀렉트 빌드
async function buildFormSelects(){
  // 상담사
  $("#form-counselor").innerHTML = `<option value="">선택</option>` + State.counselors
    .map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");
  // 지점
  $("#form-branch").innerHTML = `<option value="">선택</option>` + State.branches
    .filter(b=>b.active)
    .map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  // 팀
  $("#form-team").innerHTML = `<option value="">선택</option>` + State.teams
    .filter(t=>t.active)
    .map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
}

// 지점에 따른 과목 목록
async function refreshSubjects(branchCode){
  const reqSel = $("#form-requested");
  const regSel = $("#form-registered");
  if (!branchCode) {
    reqSel.innerHTML = `<option value="">선택</option>`;
    regSel.innerHTML = `<option value="">선택</option>`;
    return;
  }
  const list = await ensureSubjects(branchCode);
  const opts = `<option value="">선택</option>` + list.map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
  reqSel.innerHTML = opts;
  regSel.innerHTML = opts;
}

// 저장(생성/수정 통합)
async function onSave(){
  const id = $("#form-id").value;
  const payload = {
    date: $("#form-date").value,
    start_time: $("#form-start").value,
    end_time: $("#form-end").value,
    counselor_id: $("#form-counselor").value ? +$("#form-counselor").value : null,
    branch: $("#form-branch").value,
    team: $("#form-team").value,
    requested_subject_id: $("#form-requested").value ? +$("#form-requested").value : null,
    registered_subject_id: $("#form-registered").value ? +$("#form-registered").value : null,
    mode: $("#form-mode").value,
    status: $("#form-status").value,
    cancel_reason: $("#form-cancel").value || null,
    comment: $("#form-comment").value || null
  };
  try{
    const res = await fetch(id ? (`/api/sessions/${id}`) : "/api/sessions", {
      method: id ? "PUT" : "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text();
      alert(`저장 실패: ${res.status}\n${txt}`);
      return;
    }
    closeModal();
    await loadAndRender();
  }catch(err){
    console.error(err);
    alert("저장 중 오류가 발생했습니다.");
  }
}

// 삭제
async function onDelete(){
  const id = $("#form-id").value;
  if (!id) return;
  if (!confirm("정말 삭제하시겠습니까?")) return;
  try{
    const res = await fetch(`/api/sessions/${id}`, { method:"DELETE" });
    if (!res.ok) {
      const txt = await res.text();
      alert(`삭제 실패: ${res.status}\n${txt}`);
      return;
    }
    closeModal();
    await loadAndRender();
  }catch(err){
    console.error(err);
    alert("삭제 중 오류가 발생했습니다.");
  }
}
