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
});

// ========== 대시보드 ==========
async function initDashboard(){
  const fromEl=$("#dash-from"), toEl=$("#dash-to"), brEl=$("#dash-branch"), teamEl=$("#dash-team");

  // 기간 기본: 최근 30일
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

    // 카드
    $("#card-branch-reg").textContent = fmtRate(data.cards.branch_registration_rate);
    $("#card-branch-counsel").textContent = fmtRate(data.cards.branch_counseling_rate);
    $("#card-subject-reg-req").textContent = fmtRate(data.cards.subject_registration_rate_request_basis);
    $("#card-subject-reg-reg").textContent = fmtRate(data.cards.subject_registration_rate_registered_basis);

    // 지점 표
    const tb = $("#tbl-branch tbody"); tb.innerHTML = "";
    for (const r of data.branch_stats){
      const tr = document.createElement("tr");
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

    // 과목 표(신청 기준)
    const tReq = $("#tbl-subject-req tbody"); tReq.innerHTML = "";
    for (const s of (data.subject_stats_request || []).slice().sort((a,b)=> (b.registration_rate||0) - (a.registration_rate||0))){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.subject_name}</td>
        <td>${s.branch}</td>
        <td>${s.counseling}</td>
        <td>${s.registered}</td>
        <td>${fmtRate(s.registration_rate)}</td>
      `;
      tReq.appendChild(tr);
    }

    // 과목 표(등록 기준·보조)
    const tReg = $("#tbl-subject-reg tbody"); tReg.innerHTML = "";
    for (const s of (data.subject_stats_registered || []).slice().sort((a,b)=> (b.registration_rate_registered_basis||0) - (a.registration_rate_registered_basis||0))){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${s.subject_name}</td>
        <td>${s.branch}</td>
        <td>${s.counseling_by_request}</td>
        <td>${s.registered_by_registered}</td>
        <td>${fmtRate(s.registration_rate_registered_basis)}</td>
      `;
      tReg.appendChild(tr);
    }
  }

  function fmtRate(v){ return (v===null||v===undefined) ? "-" : (v*100).toFixed(1)+"%"; }
}

// ========== 주간 캘린더(생략: 기존과 동일) ==========
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

  const scale = $("#time-scale"); scale.innerHTML = "";
  for (let m=DAY_START; m<=DAY_END; m+=SLOT_MIN){ const t=document.createElement("div"); t.className="time-slot"; t.style.height=24+"px"; const h=Math.floor(m/60), mm=m%60; t.textContent=`${pad2(h)}:${pad2(mm)}`; scale.appendChild(t); }
  for (let i=0;i<7;i++){ $("#calendar .cal-header .day-col[data-day='"+i+"']").innerHTML = `<div class="day-label" id="day-label-${i}"></div>`; }

  $$("#calendar .cal-body .day-col.body").forEach((col,idx)=>{
    col.addEventListener("click", async (e)=>{
      const rect=col.getBoundingClientRect(), y=e.clientY-rect.top;
      const minutesFromStart = Math.max(0, Math.min(DAY_END-DAY_START, Math.round(y/24)*SLOT_MIN));
      const startMin = DAY_START + minutesFromStart, endMin = Math.min(DAY_END, startMin + 60);
      const d = addMinutes(weekStart, idx*24*60);
      openSessionModal({
        id:"",
        date: toDateInput(d),
        start_time: `${pad2(Math.floor(startMin/60))}:${pad2(startMin%60)}`,
        end_time: `${pad2(Math.floor(endMin/60))}:${pad2(endMin%60)}`,
        counselor_id:"",
        branch: selBranch.value || "",
        team: selTeam.value || "",
        mode: selMode.value || "OFFLINE",
        status: "PENDING",
        requested_subject_id:"",
        registered_subject_id:"",
        cancel_reason:"",
        comment:""
      }, "create");
    });
  });

  buildSessionModalCommon();
  loadAndRenderWeek();

  async function loadAndRenderWeek(){
    for (let i=0;i<7;i++){
      const d = addMinutes(weekStart, i*24*60);
      $("#day-label-"+i).textContent = `${["월","화","수","목","금","토","일"][i]} ${d.getMonth()+1}/${d.getDate()}`;
    }
    const params = new URLSearchParams({
      from_date: toDateInput(weekStart),
      to_date: toDateInput(addMinutes(weekStart, 6*24*60))
    });
    if (selBranch.value) params.append("branch", selBranch.value);
    if (selTeam.value) params.append("team", selTeam.value);
    if (selCounselor.value) params.append("counselor_id", selCounselor.value);
    if (selMode.value) params.append("mode", selMode.value);

    const sessions = await fetchJSON("/api/sessions?"+params.toString());
    renderWeekColumns(sessions);
  }

  function renderWeekColumns(sessions){
    $$("#calendar .cal-body .day-col.body").forEach(col=>{ col.innerHTML=""; col.style.position="relative"; col.style.height=((DAY_END-DAY_START)/SLOT_MIN)*SLOT_HEIGHT+"px"; });
    const byDate = new Map();
    for (const s of sessions){ if(!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
    for (let i=0;i<7;i++){
      const d = toDateInput(addMinutes(weekStart, i*24*60));
      const list = (byDate.get(d) || []).sort((a,b)=>a.start_time.localeCompare(b.start_time));
      const col = $(`#calendar .cal-body .day-col.body[data-day="${i}"]`);
      for (const ev of list){
        const el = document.createElement("div");
        const color = statusColor(ev.status);
        el.className="event"; el.style.top=posTopPx(ev.start_time)+"px";
        el.style.height=Math.max(20, heightPx(ev.start_time, ev.end_time))+"px";
        el.style.background=color.bg; el.style.borderColor=color.border;
        el.title = `#${ev.counselor_id} ${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)} (${ev.status})`;
        el.innerHTML = `<div class="ev-time">${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)}</div><div class="ev-title">#${ev.counselor_id} ${ev.status}</div>`;
        el.addEventListener("click", (e)=>{ e.stopPropagation(); openSessionModal(ev, "edit"); });
        col.appendChild(el);
      }
    }
  }
}

// 세션 모달(공용) -------------------------------------------------
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
    if ($("#calendar")) location.reload();
    if ($("#day-board")) loadDayAndRender();
    if ($("#res-table")) loadResults();
    if ($("#tbl-branch")) $("#dash-apply").click();
  }catch(e){ alert("저장 오류: "+e.message); }
}
async function onDeleteSession(){
  const id=$("#form-id").value; if(!id) return;
  if(!confirm("정말 삭제하시겠습니까?")) return;
  const r = await fetch(`/api/sessions/${id}`, {method:"DELETE"});
  if(!r.ok){ alert("삭제 실패: "+await r.text()); return; }
  $("#modal").classList.add("hidden");
  if ($("#calendar")) location.reload();
  if ($("#day-board")) loadDayAndRender();
  if ($("#res-table")) loadResults();
  if ($("#tbl-branch")) $("#dash-apply").click();
}

// ========== 결과 관리(기존 그대로, 생략) ==========
function initResultsTable(){ /* ... 기존 구현 유지 ... */ }

// ========== 일자 타임라인(기존 그대로, 생략) ==========
function initDayTimeline(){ /* ... 기존 구현 유지 ... */ }

// ========== 일별 DB 입력 ==========
function initAdminDB(){
  // 지점 입력
  const dateB=$("#db-date-branch"), selB=$("#db-branch"), cntB=$("#db-count-branch"), btnB=$("#db-save-branch");
  const toB=$("#db-to-branch"), fromB=$("#db-from-branch"), fSelB=$("#db-filter-branch"), btnLB=$("#db-load-branch"), tbodyB=$("#db-table-branch tbody");
  // 팀 입력
  const dateT=$("#db-date-team"), selT=$("#db-team"), cntT=$("#db-count-team"), btnT=$("#db-save-team");
  const toT=$("#db-to-team"), fromT=$("#db-from-team"), fSelT=$("#db-filter-team"), btnLT=$("#db-load-team"), tbodyT=$("#db-table-team tbody");

  const today=new Date();
  dateB.value = toDateInput(today);
  dateT.value = toDateInput(today);

  selB.innerHTML = Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  fSelB.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");

  selT.innerHTML = Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
  fSelT.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");

  const to=new Date(), from=new Date(); from.setDate(to.getDate()-7);
  toB.value = toDateInput(to); fromB.value = toDateInput(from);
  toT.value = toDateInput(to); fromT.value = toDateInput(from);

  btnB.addEventListener("click", async ()=>{
    try{
      await fetchJSON("/api/daily-db", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ date: dateB.value, branch: selB.value, db_count: parseInt(cntB.value||"0",10) })
      });
      alert("지점 DB 저장 완료");
      await loadBranchList();
    }catch(e){ alert("지점 DB 저장 실패: "+e.message); }
  });

  btnT.addEventListener("click", async ()=>{
    try{
      await fetchJSON("/api/daily-db-team", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ date: dateT.value, team: selT.value, db_count: parseInt(cntT.value||"0",10) })
      });
      alert("팀 DB 저장 완료");
      await loadTeamList();
    }catch(e){ alert("팀 DB 저장 실패: "+e.message); }
  });

  btnLB.addEventListener("click", loadBranchList);
  btnLT.addEventListener("click", loadTeamList);

  loadBranchList();
  loadTeamList();

  async function loadBranchList(){
    const all = await fetchJSON("/api/daily-db");
    const fromV=fromDateInput(fromB.value), toV=fromDateInput(toB.value), fb=fSelB.value;
    const rows = all.filter(r=>{
      const d=fromDateInput(r.date);
      return d>=fromV && d<=toV && (!fb || r.branch===fb);
    }).sort((a,b)=> (a.date===b.date ? a.branch.localeCompare(b.branch) : b.date.localeCompare(a.date)));
    tbodyB.innerHTML = rows.map(r=>`<tr><td>${r.date}</td><td>${r.branch}</td><td>${r.db_count}</td></tr>`).join("") || `<tr><td colspan="3">데이터 없음</td></tr>`;
  }

  async function loadTeamList(){
    const all = await fetchJSON("/api/daily-db-team");
    const fromV=fromDateInput(fromT.value), toV=fromDateInput(toT.value), ft=fSelT.value;
    const rows = all.filter(r=>{
      const d=fromDateInput(r.date);
      return d>=fromV && d<=toV && (!ft || r.team===ft);
    }).sort((a,b)=> (a.date===b.date ? a.team.localeCompare(b.team) : b.date.localeCompare(a.date)));
    tbodyT.innerHTML = rows.map(r=>`<tr><td>${r.date}</td><td>${r.team}</td><td>${r.db_count}</td></tr>`).join("") || `<tr><td colspan="3">데이터 없음</td></tr>`;
  }
}
