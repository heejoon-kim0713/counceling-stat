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

  if ($("#tbl-branch")) initDashboard();     // /dashboard
  if ($("#calendar")) initWeeklyCalendar();  // /calendar/weekly
  if ($("#res-table")) initResultsTable();   // /results
  if ($("#day-board")) initDayTimeline();    // /calendar/day
  if ($("#db-table-branch")) initAdminDB();  // /admin/db
  if ($("#my-daily")) initMyDaily();         // /my/daily
  if ($("#month-board")) initMonthlyCalendar(); // /calendar/month
});

// ========== 대시보드(라벨 표기/보조 카드 포함) ==========
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

// ========== 주간 캘린더(핵심만 유지) ==========
function initWeeklyCalendar(){
  const weekStartInput = $("#week-start");
  const btnPrev = $("#btn-prev-week"), btnNext = $("#btn-next-week");
  const selBranch = $("#filter-branch"), selTeam = $("#filter-team"), selCounselor = $("#filter-counselor"), selMode = $("#filter-mode");

  selBranch.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  selTeam.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
  selCounselor.innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  let weekStart = startOfWeek(new Date());
  weekStartInput.value = toDateInput(weekStart);

  btnPrev.addEventListener("click", ()=>{ weekStart = addMinutes(weekStart, -7*24*60); weekStartInput.value = toDateInput(weekStart); loadAndRenderWeek(); });
  btnNext.addEventListener("click", ()=>{ weekStart = addMinutes(weekStart, 7*24*60); weekStartInput.value = toDateInput(weekStart); loadAndRenderWeek(); });
  weekStartInput.addEventListener("change", e=>{ weekStart = startOfWeek(fromDateInput(e.target.value)); e.target.value = toDateInput(weekStart); loadAndRenderWeek(); });
  [selBranch, selTeam, selCounselor, selMode].forEach(el=>el.addEventListener("change", loadAndRenderWeek));

  const scale = $("#time-scale"); if (scale){ scale.innerHTML = ""; for (let m=DAY_START; m<=DAY_END; m+=SLOT_MIN){ const t=document.createElement("div"); t.className="time-slot"; t.style.height=24+"px"; const h=Math.floor(m/60), mm=m%60; t.textContent=`${pad2(h)}:${pad2(mm)}`; scale.appendChild(t); } }
  for (let i=0;i<7;i++){ const hdr = $("#calendar .cal-header .day-col[data-day='"+i+"']"); if (hdr) hdr.innerHTML = `<div class="day-label" id="day-label-${i}"></div>`; }

  $$("#calendar .cal-body .day-col.body").forEach((col,idx)=>{
    col.addEventListener("click", async (e)=>{
      const rect=col.getBoundingClientRect(), y=e.clientY-rect.top;
      const minutesFromStart = Math.max(0, Math.min(DAY_END-DAY_START, Math.round(y/24)*SLOT_MIN));
      const startMin = DAY_START + minutesFromStart, endMin = Math.min(DAY_END, startMin + 60);
      const base = startOfWeek(fromDateInput($("#week-start").value)); const d = addMinutes(base, idx*24*60);
      openSessionModal({
        id:"", date: toDateInput(d),
        start_time: `${pad2(Math.floor(startMin/60))}:${pad2(startMin%60)}`,
        end_time: `${pad2(Math.floor(endMin/60))}:${pad2(endMin%60)}`,
        counselor_id:"", branch: selBranch.value || "", team: selTeam.value || "",
        mode: selMode.value || "OFFLINE", status: "PENDING",
        requested_subject_id:"", registered_subject_id:"", cancel_reason:"", comment:""
      }, "create");
    });
  });

  buildSessionModalCommon();
  loadAndRenderWeek();

  async function loadAndRenderWeek(){
    for (let i=0;i<7;i++){
      const base = startOfWeek(fromDateInput($("#week-start").value)); const d = addMinutes(base, i*24*60);
      const lbl = $("#day-label-"+i); if (lbl) lbl.textContent = `${["월","화","수","목","금","토","일"][i]} ${d.getMonth()+1}/${d.getDate()}`;
    }
    const params = new URLSearchParams({
      from_date: $("#week-start").value,
      to_date: toDateInput(addMinutes(fromDateInput($("#week-start").value), 6*24*60))
    });
    if (selBranch.value) params.append("branch", selBranch.value);
    if (selTeam.value) params.append("team", selTeam.value);
    if (selCounselor.value) params.append("counselor_id", selCounselor.value);
    if (selMode.value) params.append("mode", selMode.value);

    const sessions = await fetchJSON("/api/sessions?"+params.toString());
    $$("#calendar .cal-body .day-col.body").forEach(col=>{ col.innerHTML=""; col.style.position="relative"; col.style.height=((DAY_END-DAY_START)/SLOT_MIN)*SLOT_HEIGHT+"px"; });
    const byDate = new Map(); for (const s of sessions){ if(!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
    for (let i=0;i<7;i++){
      const d = toDateInput(addMinutes(fromDateInput($("#week-start").value), i*24*60));
      const list = (byDate.get(d) || []).sort((a,b)=>a.start_time.localeCompare(b.start_time));
      const col = $(`#calendar .cal-body .day-col.body[data-day="${i}"]`);
      for (const ev of list){
        const el=document.createElement("div"); const color=statusColor(ev.status);
        el.className="event"; el.style.top=posTopPx(ev.start_time)+"px"; el.style.height=Math.max(20, heightPx(ev.start_time, ev.end_time))+"px";
        el.style.background=color.bg; el.style.borderColor=color.border;
        el.title = `#${ev.counselor_id} ${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)} (${ev.status})`;
        el.innerHTML = `<div class="ev-time">${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)}</div><div class="ev-title">#${ev.counselor_id} ${ev.status}</div>`;
        el.addEventListener("click", (e)=>{ e.stopPropagation(); openSessionModal(ev, "edit"); });
        col.appendChild(el);
      }
    }
  }
}

// ========== 결과 관리(이미 구현됨) ==========
function initResultsTable(){ /* 결과 테이블 초기화는 기존 코드 유지 */ }
async function loadResults(){ /* 기존 코드 유지 */ }
function onBatchApply(){ /* 기존 코드 유지 */ }

// ========== 일자 타임라인(이미 구현됨) ==========
function initDayTimeline(){ /* 기존 코드 유지 */ }
async function loadDayAndRender(){ /* 기존 코드 유지 */ }
function renderDayRows(list){ /* 기존 코드 유지 */ }

// ========== 일별 DB 입력(이미 구현됨) ==========
function initAdminDB(){ /* 기존 코드 유지 */ }

// ========== 내 일자 등록 ==========
async function initMyDaily(){
  const myDate=$("#my-date"), mySel=$("#my-counselor"), head=$("#my-row-head"), ctx=$("#my-ctx");
  mySel.innerHTML = `<option value="">상담사 선택</option>` + Meta.counselors.map(c=>`<option value="${c.id}" data-branch="${c.branch}" data-team="${c.team}">${c.name} (${c.branch}/${c.team})</option>`).join("");
  const today=new Date(); myDate.value=toDateInput(today);
  const rail=$("#my-time-rail"); rail.innerHTML=""; for (let m=DAY_START; m<=DAY_END; m+=SLOT_MIN){ const div=document.createElement("div"); div.className="time-slot"; div.style.height=24+"px"; const h=Math.floor(m/60), mm=m%60; div.textContent=`${pad2(h)}:${pad2(mm)}`; rail.appendChild(div); }
  $("#my-row-body").style.position="relative"; $("#my-row-body").style.height=((DAY_END-DAY_START)/SLOT_MIN)*SLOT_HEIGHT+"px";

  $("#my-row-body").addEventListener("click", (e)=>{
    const rect=e.currentTarget.getBoundingClientRect(), y=e.clientY-rect.top;
    const minutesFromStart = Math.max(0, Math.min(DAY_END-DAY_START, Math.round(y/24)*SLOT_MIN));
    const startMin = DAY_START + minutesFromStart, endMin = Math.min(DAY_END, startMin + 60);
    const cId = mySel.value ? +mySel.value : null;
    if (!cId){ alert("상담사를 먼저 선택해 주세요."); return; }
    const c = Meta.counselors.find(x=>x.id===cId);
    openSessionModal({
      id:"", date: myDate.value,
      start_time: `${pad2(Math.floor(startMin/60))}:${pad2(startMin%60)}`,
      end_time: `${pad2(Math.floor(endMin/60))}:${pad2(endMin%60)}`,
      counselor_id: cId, branch: c.branch, team: c.team,
      mode: "OFFLINE", status: "PENDING",
      requested_subject_id:"", registered_subject_id:"", cancel_reason:"", comment:""
    }, "create");
  });

  mySel.addEventListener("change", ()=>{
    const opt = mySel.selectedOptions[0];
    const name = mySel.value ? (Meta.counselors.find(x=>x.id===+mySel.value)?.name) : "선택된 상담사";
    head.textContent = name || "선택된 상담사";
    const br = opt?.dataset.branch || "-"; const tm = opt?.dataset.team || "-";
    ctx.textContent = `지점/팀: ${br} / ${tm}`;
    loadMyDay();
  });
  myDate.addEventListener("change", loadMyDay);

  loadMyDay();
}
async function loadMyDay(){
  const mySel=$("#my-counselor"); const cId = mySel.value ? +mySel.value : null;
  const body=$("#my-row-body"); body.innerHTML="";
  if (!cId) return;
  const d = $("#my-date").value;
  const params = new URLSearchParams({ from_date:d, to_date:d, counselor_id: String(cId) });
  const list = await fetchJSON("/api/sessions?"+params.toString());
  for (const ev of list.sort((a,b)=>a.start_time.localeCompare(b.start_time))){
    const color = statusColor(ev.status);
    const el=document.createElement("div"); el.className="event";
    el.style.top=posTopPx(ev.start_time)+"px"; el.style.height=Math.max(20, heightPx(ev.start_time, ev.end_time))+"px";
    el.style.background=color.bg; el.style.borderColor=color.border;
    el.title = `${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)} (${ev.status})`;
    el.innerHTML = `<div class="ev-time">${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)}</div><div class="ev-title">${ev.status}</div>`;
    el.addEventListener("click", ()=>openSessionModal(ev, "edit"));
    body.appendChild(el);
  }
}

// ========== 월간 캘린더 ==========
function daysInMonth(year, month){ return new Date(year, month+1, 0).getDate(); }
function firstWeekday(year, month){ const d=new Date(year, month, 1); return (d.getDay()+6)%7; /* 월=0 기준 */ }

function initMonthlyCalendar(){
  const ymEl=$("#mon-ym"), prev=$("#mon-prev"), next=$("#mon-next");
  const bSel=$("#mon-branch"), tSel=$("#mon-team"), cSel=$("#mon-counselor"), mSel=$("#mon-mode");
  bSel.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  tSel.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
  cSel.innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  const today=new Date(); ymEl.value = toMonthInput(today);
  prev.addEventListener("click", ()=>{ const d=fromMonthInput(ymEl.value); d.setMonth(d.getMonth()-1); ymEl.value=toMonthInput(d); loadAndRenderMonth(); });
  next.addEventListener("click", ()=>{ const d=fromMonthInput(ymEl.value); d.setMonth(d.getMonth()+1); ymEl.value=toMonthInput(d); loadAndRenderMonth(); });
  [ymEl,bSel,tSel,cSel,mSel].forEach(el=>el.addEventListener("change", loadAndRenderMonth));

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

  const byDate = new Map();
  for (const s of sessions){
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
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

// ========== 공용 모달 로직 ==========
function buildSessionModalCommon(){
  const modal = $("#modal"); if(!modal) return;
  $("#modal-close").addEventListener("click", ()=>modal.classList.add("hidden"));
  $("#btn-delete").addEventListener("click", onDeleteSession);
  $("#btn-save").addEventListener("click", onSaveSession);

  $("#form-counselor").addEventListener("change", async (e)=>{
    const id = +e.target.value; const c = Meta.counselors.find(x=>x.id===id);
    if (c){ $("#form-branch").value = c.branch; $("#form-team").value = c.team; await refreshFormSubjects(c.branch); }
  });
  $("#form-branch").addEventListener("change", async (e)=>{ await refreshFormSubjects(e.target.value); });
  $("#form-status").addEventListener("change", refreshConditionalFields);

  $("#form-counselor").innerHTML = `<option value="">선택</option>` + Meta.counselors.map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");
  $("#form-branch").innerHTML = `<option value="">선택</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  $("#form-team").innerHTML = `<option value="">선택</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
}
function refreshConditionalFields(){
  const status = $("#form-status").value;
  $("#form-registered").parentElement.style.display = "block";
  $("#form-cancel").parentElement.style.display = (status==="CANCELED") ? "block":"none";
}
async function refreshFormSubjects(branch){
  const reqSel=$("#form-requested"), regSel=$("#form-registered");
  if (!branch){ reqSel.innerHTML=`<option value="">선택</option>`; regSel.innerHTML=`<option value="">선택</option>`; return; }
  const list = await ensureSubjects(branch);
  const opts = `<option value="">선택</option>` + list.map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
  reqSel.innerHTML=opts; regSel.innerHTML=opts;
}
function openSessionModal(ev, mode){
  $("#modal-title").textContent = mode==="create" ? "새 일정" : "일정 편집";
  $("#btn-delete").style.display = mode==="edit" ? "inline-block" : "none";
  $("#form-id").value = ev.id || "";
  $("#form-date").value = ev.date || "";
  $("#form-start").value = (ev.start_time || "09:00").slice(0,5);
  $("#form-end").value = (ev.end_time || "10:00").slice(0,5);
  $("#form-counselor").value = ev.counselor_id || "";
  $("#form-branch").value = ev.branch || "";
  $("#form-team").value = ev.team || "";
  $("#form-mode").value = ev.mode || "OFFLINE";
  $("#form-status").value = ev.status || "PENDING";
  $("#form-comment").value = ev.comment || "";
  refreshFormSubjects(ev.branch || "");
  $("#form-requested").value = ev.requested_subject_id || "";
  $("#form-registered").value = ev.registered_subject_id || "";
  refreshConditionalFields();
  $("#modal").classList.remove("hidden");
}
async function onSaveSession(){
  const id=$("#form-id").value;
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
    const res = await fetch(id ? `/api/sessions/${id}` : "/api/sessions", {
      method: id ? "PUT" : "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    if(!res.ok){ alert("저장 실패: "+await res.text()); return; }
    $("#modal").classList.add("hidden");
    if ($("#my-daily")) loadMyDay();
    if ($("#calendar")) location.reload();
    if ($("#day-board")) loadDayAndRender();
    if ($("#tbl-branch")) { const btn=$("#dash-apply"); if(btn) btn.click(); }
  }catch(e){ alert("저장 오류: "+e.message); }
}
async function onDeleteSession(){
  const id=$("#form-id").value; if(!id) return;
  if(!confirm("정말 삭제하시겠습니까?")) return;
  const r = await fetch(`/api/sessions/${id}`, {method:"DELETE"});
  if(!r.ok){ alert("삭제 실패: "+await r.text()); return; }
  $("#modal").classList.add("hidden");
  if ($("#my-daily")) loadMyDay();
  if ($("#calendar")) location.reload();
  if ($("#day-board")) loadDayAndRender();
  if ($("#tbl-branch")) { const btn=$("#dash-apply"); if(btn) btn.click(); }
}
