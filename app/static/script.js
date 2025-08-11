// app/static/script.js
// 공용 유틸/상태 -------------------------------------------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const pad2 = (n) => (n < 10 ? "0"+n : ""+n);
const SLOT_MIN = 30, DAY_START = 9*60, DAY_END = 21*60, SLOT_HEIGHT = 24;

const Meta = {
  branches: [],
  teams: [],
  counselors: [],
  subjectsByBranch: new Map(), // branch -> [{id,name}]
};

async function fetchJSON(url, opt){
  const r = await fetch(url, opt);
  if (!r.ok){
    const t = await r.text().catch(()=>r.statusText);
    throw new Error(`[${r.status}] ${t}`);
  }
  return r.json();
}
async function loadMetaCommon(){
  Meta.branches = await fetchJSON("/api/meta/branches");
  Meta.teams = await fetchJSON("/api/meta/teams");
  Meta.counselors = await fetchJSON("/api/counselors");
}
async function ensureSubjects(branch){
  if (!branch) return [];
  if (Meta.subjectsByBranch.has(branch)) return Meta.subjectsByBranch.get(branch);
  const list = await fetchJSON(`/api/subjects?branch=${encodeURIComponent(branch)}`);
  Meta.subjectsByBranch.set(branch, list);
  return list;
}
function toDateInput(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fromDateInput(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function toMonthInput(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function fromMonthInput(s){ const [y,m]=s.split("-").map(Number); return new Date(y, m-1, 1); }
function addMinutes(d, m){ return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m); }
function startOfWeek(d){ const day=d.getDay(), diff=(day===0?-6:1-day); const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m; }
function statusColor(status){
  switch(status){
    case "PENDING": return {bg:"#e5e7eb", border:"#d1d5db"};
    case "REGISTERED": return {bg:"#dbeafe", border:"#93c5fd"};
    case "NOT_REGISTERED": return {bg:"#fde68a", border:"#f59e0b"};
    case "DONE": return {bg:"#d1fae5", border:"#34d399"};
    case "CANCELED": return {bg:"#fecaca", border:"#f87171"};
    default: return {bg:"#e5e7eb", border:"#d1d5db"};
  }
}
function posTopPx(hhmm){ const [h,mm]=hhmm.split(":").map(Number); const min=(h*60+mm)-DAY_START; return (min/SLOT_MIN)*SLOT_HEIGHT; }
function heightPx(start,end){ const [h1,m1]=start.split(":").map(Number), [h2,m2]=end.split(":").map(Number); const dur=(h2*60+m2)-(h1*60+m1); return (dur/SLOT_MIN)*SLOT_HEIGHT - 2; }

// 초기 분기 -------------------------------------------------------
document.addEventListener("DOMContentLoaded", async ()=>{
  await loadMetaCommon();

  // 대시보드
  if ($("#tbl-branch")) initDashboard();

  // 주간 캘린더
  if ($("#calendar")) initWeeklyCalendar();

  // 결과 관리
  if ($("#res-table")) initResultsTable();

  // 일자 타임라인
  if ($("#day-board")) initDayTimeline();

  // 일별 DB 입력
  if ($("#db-table-branch")) initAdminDB();

  // 내 일자
  if ($("#my-daily")) initMyDaily();

  // 월간 캘린더
  if ($("#month-board")) initMonthlyCalendar();
});

// ========== 대시보드 ==========
async function initDashboard(){
  const fromEl=$("#dash-from"), toEl=$("#dash-to"), brEl=$("#dash-branch"), teamEl=$("#dash-team");
  const to=new Date(), from=new Date(); from.setDate(to.getDate()-30);
  fromEl.value = toDateInput(from); toEl.value = toDateInput(to);
  brEl.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  teamEl.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
  $("#dash-apply").addEventListener("click", loadDashboard);
  await loadDashboard();
  async function loadDashboard(){
    const params = new URLSearchParams({ from_date: fromEl.value, to_date: toEl.value });
    if (brEl.value) params.append("branch", brEl.value);
    if (teamEl.value) params.append("team", teamEl.value);
    const data = await fetchJSON("/api/stats/overview?"+params.toString());

    $("#card-branch-reg").textContent = fmtRate(data.cards.branch_registration_rate);
    $("#card-branch-counsel").textContent = fmtRate(data.cards.branch_counseling_rate);
    const cardReq = $("#card-subject-reg-req") || $("#card-subject-reg");
    if (cardReq) cardReq.textContent = fmtRate(data.cards.subject_registration_rate_request_basis ?? data.cards.subject_registration_rate);
    const cardReg = $("#card-subject-reg-reg");
    if (cardReg) cardReg.textContent = fmtRate(data.cards.subject_registration_rate_registered_basis);

    // 지점 표(라벨)
    const tb = $("#tbl-branch tbody"); tb.innerHTML="";
    for (const r of data.branch_stats){
      const tr=document.createElement("tr");
      tr.innerHTML = `
        <td>${r.branch_label}</td>
        <td>${r.counseling}</td>
        <td>${r.registered}</td>
        <td>${r.total_db}</td>
        <td>${fmtRate(r.registration_rate)}</td>
        <td>${fmtRate(r.counseling_rate)}</td>
      `;
      tb.appendChild(tr);
    }

    // 과목 표(신청 기준: 지점 라벨 표시)
    const tReq=$("#tbl-subject-req tbody"); if (tReq){ tReq.innerHTML = "";
      for (const s of (data.subject_stats_request||[]).slice().sort((a,b)=>(b.registration_rate||0)-(a.registration_rate||0))){
        const tr=document.createElement("tr");
        tr.innerHTML = `
          <td>${s.subject_name}</td>
          <td>${s.branch_label}</td>
          <td>${s.counseling}</td>
          <td>${s.registered}</td>
          <td>${fmtRate(s.registration_rate)}</td>
        `;
        tReq.appendChild(tr);
      }
    }

    // 과목 표(등록 기준·보조: 지점 라벨 표시)
    const tReg=$("#tbl-subject-reg tbody"); if (tReg){ tReg.innerHTML = "";
      for (const s of (data.subject_stats_registered||[]).slice().sort((a,b)=>(b.registration_rate_registered_basis||0)-(a.registration_rate_registered_basis||0))){
        const tr=document.createElement("tr");
        tr.innerHTML = `
          <td>${s.subject_name}</td>
          <td>${s.branch_label}</td>
          <td>${s.counseling_by_request}</td>
          <td>${s.registered_by_registered}</td>
          <td>${fmtRate(s.registration_rate_registered_basis)}</td>
        `;
        tReg.appendChild(tr);
      }
    }
  }
  function fmtRate(v){ return (v===null||v===undefined) ? "-" : (v*100).toFixed(1)+"%"; }
}

// ========== 주간 캘린더(기존 유지) ==========
function initWeeklyCalendar(){ /* ...기존 주간 캘린더 초기화/모달 로직 유지... */ }

// ========== 결과 관리(기존 유지) ==========
function initResultsTable(){ /* ...기존 결과 테이블 로직 유지... */ }
function onBatchApply(){ /* ...기존 일괄 변경 로직 유지... */ }
async function loadResults(){ /* ...기존 로딩 로직 유지... */ }

// ========== 일자 타임라인(기존 유지) ==========
function initDayTimeline(){ /* ...기존 초기화... */ }
async function loadDayAndRender(){ /* ...기존 로딩/렌더... */ }
function renderDayRows(list){ /* ...기존 렌더... */ }

// ========== 일별 DB 입력(기존 유지) ==========
function initAdminDB(){ /* ...기존 DB 입력 화면 로직 유지... */ }

// ========== 내 일자(기존 유지) ==========
async function initMyDaily(){ /* ...기존 내 일자 로직 유지... */ }
async function loadMyDay(){ /* ...기존 내 일자 로딩... */ }

// ========== 월간 캘린더(신규) ==========
function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }
function firstWeekday(year, month){ const d=new Date(year, month, 1); return (d.getDay()+6)%7; /* 월=0 기준 */ }

function initMonthlyCalendar(){
  const ymEl=$("#mon-ym"), prev=$("#mon-prev"), next=$("#mon-next");
  const bSel=$("#mon-branch"), tSel=$("#mon-team"), cSel=$("#mon-counselor"), mSel=$("#mon-mode");
  // 옵션
  bSel.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  tSel.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
  cSel.innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  const today=new Date(); ymEl.value = toMonthInput(today);
  prev.addEventListener("click", ()=>{ const d=fromMonthInput(ymEl.value); d.setMonth(d.getMonth()-1); ymEl.value=toMonthInput(d); loadAndRenderMonth(); });
  next.addEventListener("click", ()=>{ const d=fromMonthInput(ymEl.value); d.setMonth(d.getMonth()+1); ymEl.value=toMonthInput(d); loadAndRenderMonth(); });
  [ymEl,bSel,tSel,cSel,mSel].forEach(el=>el.addEventListener("change", loadAndRenderMonth));

  // 모달 공용 구성(주간과 같은 모달 사용)
  buildSessionModalCommon();

  loadAndRenderMonth();
}

async function loadAndRenderMonth(){
  const ym=$("#mon-ym").value;
  const [y,m]=ym.split("-").map(Number);
  const first = new Date(y, m-1, 1);
  const last = new Date(y, m, 0);
  const from = toDateInput(first), to = toDateInput(last);

  const b=$("#mon-branch").value, t=$("#mon-team").value, c=$("#mon-counselor").value, mode=$("#mon-mode").value;
  const params = new URLSearchParams({ from_date: from, to_date: to });
  if (b) params.append("branch", b);
  if (t) params.append("team", t);
  if (c) params.append("counselor_id", c);
  if (mode) params.append("mode", mode);

  const list = await fetchJSON("/api/sessions?"+params.toString());
  renderMonthGrid(list, y, m-1);
}

function renderMonthGrid(sessions, year, month){
  const grid=$("#month-grid"); grid.innerHTML="";
  const fd = firstWeekday(year, month); // 0..6 (월요일=0)
  const dim = daysInMonth(year, month);
  const totalCells = Math.ceil((fd + dim)/7) * 7;

  // 날짜별 매핑
  const byDate = new Map();
  for (const s of sessions){
    (byDate.get(s.date) || byDate.set(s.date, []).get(s.date)).push(s);
  }

  for (let i=0;i<totalCells;i++){
    const cell = document.createElement("div");
    cell.className = "month-cell";
    const dayNum = i - fd + 1;
    if (dayNum < 1 || dayNum > dim){
      cell.classList.add("dim");
      grid.appendChild(cell);
      continue;
    }
    const dateStr = `${year}-${pad2(month+1)}-${pad2(dayNum)}`;
    const header = document.createElement("div");
    header.className="month-cell-head";
    header.textContent = String(dayNum);
    const body = document.createElement("div");
    body.className="month-cell-body";

    const list = (byDate.get(dateStr) || []).slice().sort((a,b)=>a.start_time.localeCompare(b.start_time));
    for (const ev of list){
      const item = document.createElement("div");
      const col = statusColor(ev.status);
      item.className="month-item";
      item.style.background = col.bg;
      item.style.borderColor = col.border;
      item.title = `#${ev.counselor_id} ${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)} (${ev.status})`;
      item.textContent = `${ev.start_time.slice(0,5)} ${ev.status}`;
      item.addEventListener("click", (e)=>{ e.stopPropagation(); openSessionModal(ev, "edit"); });
      body.appendChild(item);
    }

    cell.appendChild(header);
    cell.appendChild(body);
    cell.addEventListener("click", ()=>{
      // 기본 10:00~11:00로 새 일정 모달
      openSessionModal({
        id:"",
        date: dateStr,
        start_time: "10:00",
        end_time: "11:00",
        counselor_id: $("#mon-counselor").value ? +$("#mon-counselor").value : "",
        branch: $("#mon-branch").value || "",
        team: $("#mon-team").value || "",
        mode: $("#mon-mode").value || "OFFLINE",
        status: "PENDING",
        requested_subject_id:"",
        registered_subject_id:"",
        cancel_reason:"",
        comment:""
      }, "create");
    });
    grid.appendChild(cell);
  }
}
