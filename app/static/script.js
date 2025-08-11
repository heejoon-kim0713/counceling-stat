// app/static/script.js
// 공용 유틸
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const pad2 = (n) => (n < 10 ? "0"+n : ""+n);
const SLOT_MIN = 30, DAY_START = 9*60, DAY_END = 21*60, SLOT_HEIGHT = 24;

// 전역 캐시
const Meta = {
  branches: [],
  teams: [],
  counselors: [],
  subjectsByBranch: new Map(), // branch -> [{id,name}]
};

// 공용 호출
async function fetchJSON(url, opt){ const r = await fetch(url, opt); if(!r.ok){throw new Error(await r.text());} return r.json(); }
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
function toDateInput(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fromDateInput(s){ const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addMinutes(d, m){ return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m); }
function startOfWeek(d){ const day=d.getDay(), diff=(day===0?-6:1-day); const m=new Date(d); m.setDate(d.getDate()+diff); m.setHours(0,0,0,0); return m; }
function posTopPx(hhmm){ const [h,mm]=hhmm.split(":").map(Number); const min=(h*60+mm)-DAY_START; return (min/SLOT_MIN)*SLOT_HEIGHT; }
function heightPx(start,end){ const [h1,m1]=start.split(":").map(Number), [h2,m2]=end.split(":").map(Number); const dur=(h2*60+m2)-(h1*60+m1); return (dur/SLOT_MIN)*SLOT_HEIGHT - 2; }

// 초기 분기
document.addEventListener("DOMContentLoaded", async ()=>{
  await loadMetaCommon();

  if ($("#calendar")) initWeeklyCalendar();        // /calendar/weekly
  if ($("#res-table")) initResultsTable();         // /results
  if ($("#day-board")) initDayTimeline();          // /calendar/day
});

// ========== 주간 캘린더 ==========
function initWeeklyCalendar(){
  // 필터/툴바
  const weekStartInput = $("#week-start");
  const btnPrev = $("#btn-prev-week"), btnNext = $("#btn-next-week");
  const selBranch = $("#filter-branch"), selTeam = $("#filter-team"), selCounselor = $("#filter-counselor"), selMode = $("#filter-mode");

  // 옵션 주입
  selBranch.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  selTeam.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
  selCounselor.innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  let weekStart = startOfWeek(new Date());
  weekStartInput.value = toDateInput(weekStart);

  btnPrev.addEventListener("click", ()=>{ weekStart = addMinutes(weekStart, -7*24*60); weekStartInput.value = toDateInput(weekStart); loadAndRenderWeek(); });
  btnNext.addEventListener("click", ()=>{ weekStart = addMinutes(weekStart, 7*24*60); weekStartInput.value = toDateInput(weekStart); loadAndRenderWeek(); });
  weekStartInput.addEventListener("change", e=>{ weekStart = startOfWeek(fromDateInput(e.target.value)); e.target.value = toDateInput(weekStart); loadAndRenderWeek(); });
  [selBranch, selTeam, selCounselor, selMode].forEach(el=>el.addEventListener("change", loadAndRenderWeek));

  // 시간 레일
  const scale = $("#time-scale"); scale.innerHTML = "";
  for (let m=DAY_START; m<=DAY_END; m+=SLOT_MIN){ const t=document.createElement("div"); t.className="time-slot"; t.style.height=24+"px"; const h=Math.floor(m/60), mm=m%60; t.textContent=`${pad2(h)}:${pad2(mm)}`; scale.appendChild(t); }

  // 헤더 라벨
  for (let i=0;i<7;i++){ $("#calendar .cal-header .day-col[data-day='"+i+"']").innerHTML = `<div class="day-label" id="day-label-${i}"></div>`; }
  // 바디 클릭으로 새 일정
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

  async function loadAndRenderWeek(){
    // 헤더 라벨
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
    // 초기화
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

  // 모달 초기화(공용)
  buildSessionModalCommon();
  loadAndRenderWeek();
}

// 세션 모달 공용
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

  // 초기 옵션
  $("#form-counselor").innerHTML = `<option value="">선택</option>` + Meta.counselors.map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");
  $("#form-branch").innerHTML = `<option value="">선택</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  $("#form-team").innerHTML = `<option value="">선택</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
}
function refreshConditionalFields(){
  const status = $("#form-status").value;
  // 등록 과목: 보여주되, 서버 검증이 필수 처리
  $("#form-registered").parentElement.style.display = "block";
  // 취소 사유는 취소일 때만 표시
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
    // 페이지별 새로고침
    if ($("#calendar")) location.reload();
    if ($("#day-board")) loadDayAndRender();
    if ($("#res-table")) loadResults();
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
}

// ========== 결과 관리 ==========
function initResultsTable(){
  // 필터 주입
  $("#res-branch").innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  $("#res-team").innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");
  $("#res-counselor").innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c=>`<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  // 기간 기본: 최근 7일
  const to = new Date(), from = new Date(); from.setDate(to.getDate()-7);
  $("#res-from").value = toDateInput(from);
  $("#res-to").value = toDateInput(to);
  $("#res-apply").addEventListener("click", loadResults);
  $("#chk-all").addEventListener("change", (e)=>{ $$("#res-tbody input[type='checkbox']").forEach(ch=>ch.checked=e.target.checked); });

  // 일괄 변경 UI
  $("#batch-registered").innerHTML = `<option value="">등록 과목 선택</option>`;
  $("#batch-apply").addEventListener("click", onBatchApply);

  loadResults();
}

async function loadResults(){
  const params = new URLSearchParams({
    from_date: $("#res-from").value,
    to_date: $("#res-to").value
  });
  const b=$("#res-branch").value, t=$("#res-team").value, c=$("#res-counselor").value, m=$("#res-mode").value, s=$("#res-status").value;
  if (b) params.append("branch", b);
  if (t) params.append("team", t);
  if (c) params.append("counselor_id", c);
  if (m) params.append("mode", m);
  if (s) params.append("status", s);

  // 등록 과목 드롭다운은 지점 기준으로 동적 구성 → 필터 지점 선택 시 과목 목록 로드
  const regSel = $("#batch-registered");
  if (b){
    const subs = await ensureSubjects(b);
    regSel.innerHTML = `<option value="">등록 과목 선택</option>` + subs.map(x=>`<option value="${x.id}">${x.name}</option>`).join("");
  }else{
    regSel.innerHTML = `<option value="">등록 과목 선택</option>`;
  }

  const list = await fetchJSON("/api/sessions?"+params.toString());
  renderResults(list);
}

function renderResults(list){
  const tbody = $("#res-tbody"); tbody.innerHTML = "";
  const subjMap = new Map(); Meta.subjectsByBranch.forEach(arr=>arr.forEach(s=>subjMap.set(s.id, s.name)));
  const counselorMap = new Map(Meta.counselors.map(c=>[c.id, c.name]));
  for (const s of list){
    const tr = document.createElement("tr");
    const reqName = subjMap.get(s.requested_subject_id) || "";
    const regName = subjMap.get(s.registered_subject_id) || "";
    tr.innerHTML = `
      <td><input type="checkbox" data-id="${s.id}"></td>
      <td>${s.date}</td>
      <td>${s.start_time.slice(0,5)}~${s.end_time.slice(0,5)}</td>
      <td>${s.branch}</td>
      <td>${s.team}</td>
      <td>${counselorMap.get(s.counselor_id) || ("#"+s.counselor_id)}</td>
      <td>${reqName}</td>
      <td>${s.status}</td>
      <td>${regName}</td>
      <td>${s.cancel_reason || ""}</td>
      <td>${s.mode==="REMOTE"?"비":"오프"}</td>
      <td>${s.comment || ""}</td>
    `;
    tr.addEventListener("dblclick", ()=>openSessionModal(s, "edit"));
    tbody.appendChild(tr);
  }
}

async function onBatchApply(){
  const ids = $$("#res-tbody input[type='checkbox']:checked").map(ch=>+ch.dataset.id);
  if (ids.length===0){ alert("선택된 항목이 없습니다."); return; }
  const payload = {
    ids,
    status: $("#batch-status").value || null,
    registered_subject_id: $("#batch-registered").value ? +$("#batch-registered").value : null,
    cancel_reason: $("#batch-cancel").value || null,
    comment: $("#batch-comment").value || null
  };
  try{
    const r = await fetchJSON("/api/sessions/batch/update-status", {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(payload)
    });
    alert(`일괄 변경 완료: ${r.updated}건`);
    await loadResults();
  }catch(e){
    alert("일괄 변경 실패: "+e.message);
  }
}

// ========== 일자 타임라인 ==========
function initDayTimeline(){
  // 옵션
  $("#day-branch").innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b=>b.active).map(b=>`<option value="${b.code}">${b.label_ko}</option>`).join("");
  $("#day-team").innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t=>t.active).map(t=>`<option value="${t.code}">${t.label_ko}</option>`).join("");

  const today = new Date(); $("#day-date").value = toDateInput(today);
  $("#day-prev").addEventListener("click", ()=>{ const d=fromDateInput($("#day-date").value); d.setDate(d.getDate()-1); $("#day-date").value=toDateInput(d); loadDayAndRender(); });
  $("#day-next").addEventListener("click", ()=>{ const d=fromDateInput($("#day-date").value); d.setDate(d.getDate()+1); $("#day-date").value=toDateInput(d); loadDayAndRender(); });
  ["day-branch","day-team","day-mode","day-date"].forEach(id=>$("#"+id).addEventListener("change", loadDayAndRender));

  // 시간 레일
  const rail = $("#day-time-rail"); rail.innerHTML="";
  for (let m=DAY_START; m<=DAY_END; m+=SLOT_MIN){
    const div=document.createElement("div"); div.className="time-slot"; div.style.height=24+"px";
    const h=Math.floor(m/60), mm=m%60; div.textContent=`${pad2(h)}:${pad2(mm)}`;
    rail.appendChild(div);
  }

  loadDayAndRender();
}

async function loadDayAndRender(){
  const d = $("#day-date").value;
  const params = new URLSearchParams({ from_date:d, to_date:d });
  const b=$("#day-branch").value, t=$("#day-team").value, m=$("#day-mode").value;
  if (b) params.append("branch", b);
  if (t) params.append("team", t);
  if (m) params.append("mode", m);
  const list = await fetchJSON("/api/sessions?"+params.toString());
  renderDayRows(list);
}

function renderDayRows(list){
  const rowsEl = $("#day-rows"); rowsEl.innerHTML="";
  // 상담사별 그룹
  const byCounselor = new Map();
  for (const s of list){ if(!byCounselor.has(s.counselor_id)) byCounselor.set(s.counselor_id, []); byCounselor.get(s.counselor_id).push(s); }
  const nameOf = (id)=> (Meta.counselors.find(c=>c.id===id)?.name || ("#"+id));

  for (const [cid, arr] of byCounselor.entries()){
    const row = document.createElement("div"); row.className="day-row";
    row.innerHTML = `<div class="row-head">${nameOf(cid)}</div><div class="row-body"></div>`;
    const body=row.querySelector(".row-body"); body.style.position="relative"; body.style.height=((DAY_END-DAY_START)/SLOT_MIN)*SLOT_HEIGHT+"px";
    for (const ev of arr.sort((a,b)=>a.start_time.localeCompare(b.start_time))){
      const el=document.createElement("div"); el.className="event";
      const color = statusColor(ev.status);
      el.style.top=posTopPx(ev.start_time)+"px"; el.style.height=Math.max(20, heightPx(ev.start_time, ev.end_time))+"px";
      el.style.background=color.bg; el.style.borderColor=color.border;
      el.title = `${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)} (${ev.status})`;
      el.innerHTML = `<div class="ev-time">${ev.start_time.slice(0,5)}~${ev.end_time.slice(0,5)}</div><div class="ev-title">${ev.status}</div>`;
      el.addEventListener("click", ()=>openSessionModal(ev,"edit"));
      body.appendChild(el);
    }
    rowsEl.appendChild(row);
  }
}
