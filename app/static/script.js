// app/static/script.js
// -------------------- 공용 유틸/상태 --------------------
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const pad2 = (n) => (n < 10 ? "0" + n : "" + n);
const SLOT_MIN = 30, DAY_START = 9 * 60, DAY_END = 21 * 60, SLOT_HEIGHT = 24;

const Meta = {
  branches: [],
  teams: [],
  counselors: [],
  subjectsByBranch: new Map() // branch -> [{id,name}]
};

async function fetchJSON(url, opt) {
  const r = await fetch(url, opt);
  if (!r.ok) {
    const t = await r.text().catch(() => r.statusText);
    throw new Error(`[${r.status}] ${t}`);
  }
  return r.json();
}
async function loadMetaCommon() {
  Meta.branches = await fetchJSON("/api/meta/branches").catch(() => []);
  Meta.teams = await fetchJSON("/api/meta/teams").catch(() => []);
  Meta.counselors = await fetchJSON("/api/counselors").catch(() => []);
}
async function ensureSubjects(branch) {
  if (!branch) return [];
  if (Meta.subjectsByBranch.has(branch)) return Meta.subjectsByBranch.get(branch);
  const list = await fetchJSON(`/api/subjects?branch=${encodeURIComponent(branch)}`).catch(() => []);
  Meta.subjectsByBranch.set(branch, list);
  return list;
}
function toDateInput(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fromDateInput(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function toMonthInput(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function fromMonthInput(s) {
  const [y, m] = s.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
function addMinutes(d, m) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, m);
}
function startOfWeek(d) {
  const day = d.getDay(); // 0=일
  const diff = day === 0 ? -6 : 1 - day; // 월=1
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}
function statusColor(status) {
  switch (status) {
    case "PENDING": return { bg: "#e5e7eb", border: "#d1d5db" };
    case "REGISTERED": return { bg: "#dbeafe", border: "#93c5fd" };
    case "NOT_REGISTERED": return { bg: "#fde68a", border: "#f59e0b" };
    case "DONE": return { bg: "#d1fae5", border: "#34d399" };
    case "CANCELED": return { bg: "#fecaca", border: "#f87171" };
    default: return { bg: "#e5e7eb", border: "#d1d5db" };
  }
}
function posTopPx(hhmm) {
  const [h, mm] = hhmm.split(":").map(Number);
  const min = (h * 60 + mm) - DAY_START;
  return (min / SLOT_MIN) * SLOT_HEIGHT;
}
function heightPx(start, end) {
  const [h1, m1] = start.split(":").map(Number);
  const [h2, m2] = end.split(":").map(Number);
  const dur = (h2 * 60 + m2) - (h1 * 60 + m1);
  return (dur / SLOT_MIN) * SLOT_HEIGHT - 2;
}

// -------------------- 모달(공용) --------------------
function showModal() {
  const modal = $("#modal");
  if (!modal) return;
  modal.removeAttribute("hidden");
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}
function hideModal() {
  const modal = $("#modal");
  if (!modal) return;
  modal.setAttribute("hidden", "");
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}

function refreshConditionalFields() {
  const status = $("#form-status")?.value || "PENDING";
  // 등록 과목은 항상 보이되 서버 검증으로 필수 처리
  const cancelWrap = $("#form-cancel")?.parentElement;
  if (cancelWrap) cancelWrap.style.display = status === "CANCELED" ? "block" : "none";
}

async function refreshFormSubjects(branch) {
  const reqSel = $("#form-requested");
  const regSel = $("#form-registered");
  if (!reqSel || !regSel) return;
  if (!branch) {
    reqSel.innerHTML = `<option value="">선택</option>`;
    regSel.innerHTML = `<option value="">선택</option>`;
    return;
  }
  const list = await ensureSubjects(branch);
  const opts = `<option value="">선택</option>` + list.map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  reqSel.innerHTML = opts;
  regSel.innerHTML = opts;
}

function buildSessionModalCommon() {
  const modal = $("#modal");
  if (!modal) return;

  const closeBtn = $("#modal-close");
  const saveBtn = $("#btn-save");
  const delBtn = $("#btn-delete");

  if (closeBtn) closeBtn.addEventListener("click", hideModal);
  if (saveBtn) saveBtn.addEventListener("click", onSaveSession);
  if (delBtn) delBtn.addEventListener("click", onDeleteSession);

  const cSel = $("#form-counselor");
  const bSel = $("#form-branch");
  const tSel = $("#form-team");
  const sSel = $("#form-status");

  if (cSel) {
    cSel.innerHTML = `<option value="">선택</option>` + Meta.counselors.map(c => `<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");
    cSel.addEventListener("change", async (e) => {
      const id = +e.target.value;
      const c = Meta.counselors.find(x => x.id === id);
      if (c) {
        if (bSel) bSel.value = c.branch;
        if (tSel) tSel.value = c.team;
        await refreshFormSubjects(c.branch);
      }
    });
  }
  if (bSel) {
    bSel.innerHTML = `<option value="">선택</option>` + Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");
    bSel.addEventListener("change", async (e) => { await refreshFormSubjects(e.target.value); });
  }
  if (tSel) {
    tSel.innerHTML = `<option value="">선택</option>` + Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");
  }
  if (sSel) {
    sSel.addEventListener("change", refreshConditionalFields);
  }
}

function openSessionModal(ev, mode) {
  // 제목/버튼
  const title = $("#modal-title");
  const delBtn = $("#btn-delete");
  if (title) title.textContent = mode === "create" ? "새 일정" : "일정 편집";
  if (delBtn) delBtn.style.display = mode === "edit" ? "inline-block" : "none";

  // 값 바인딩
  const idEl = $("#form-id");
  const dEl = $("#form-date");
  const stEl = $("#form-start");
  const etEl = $("#form-end");
  const cSel = $("#form-counselor");
  const bSel = $("#form-branch");
  const tSel = $("#form-team");
  const mSel = $("#form-mode");
  const sSel = $("#form-status");
  const cmEl = $("#form-comment");
  const reqSel = $("#form-requested");
  const regSel = $("#form-registered");
  const cancelSel = $("#form-cancel");

  if (idEl) idEl.value = ev.id || "";
  if (dEl) dEl.value = ev.date || "";
  if (stEl) stEl.value = (ev.start_time || "09:00").slice(0, 5);
  if (etEl) etEl.value = (ev.end_time || "10:00").slice(0, 5);
  if (cSel) cSel.value = ev.counselor_id || "";
  if (bSel) bSel.value = ev.branch || "";
  if (tSel) tSel.value = ev.team || "";
  if (mSel) mSel.value = ev.mode || "OFFLINE";
  if (sSel) sSel.value = ev.status || "PENDING";
  if (cmEl) cmEl.value = ev.comment || "";

  // 과목 목록 로딩 후 값 설정
  refreshFormSubjects(ev.branch || "").then(() => {
    if (reqSel) reqSel.value = ev.requested_subject_id || "";
    if (regSel) regSel.value = ev.registered_subject_id || "";
  });

  // 취소 사유 영역 표시 제어
  if (cancelSel) cancelSel.value = ev.cancel_reason || "";

  refreshConditionalFields();
  showModal();
}

async function onSaveSession() {
  const id = $("#form-id")?.value || "";
  const payload = {
    date: $("#form-date")?.value || null,
    start_time: $("#form-start")?.value || null,
    end_time: $("#form-end")?.value || null,
    counselor_id: $("#form-counselor")?.value ? +$("#form-counselor").value : null,
    branch: $("#form-branch")?.value || "",
    team: $("#form-team")?.value || "",
    requested_subject_id: $("#form-requested")?.value ? +$("#form-requested").value : null,
    registered_subject_id: $("#form-registered")?.value ? +$("#form-registered").value : null,
    mode: $("#form-mode")?.value || "OFFLINE",
    status: $("#form-status")?.value || "PENDING",
    cancel_reason: $("#form-cancel")?.value || null,
    comment: $("#form-comment")?.value || null
  };
  try {
    const res = await fetch(id ? `/api/sessions/${id}` : "/api/sessions", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const txt = await res.text();
      alert("저장 실패: " + txt);
      return;
    }
    hideModal();
    // 뷰 별 갱신
    if ($("#my-daily")) loadMyDay();
    if ($("#calendar")) location.reload();
    if ($("#day-board")) loadDayAndRender();
    if ($("#res-table")) loadResults();
    if ($("#tbl-branch")) $("#dash-apply")?.click();
  } catch (e) {
    alert("저장 오류: " + e.message);
  }
}
async function onDeleteSession() {
  const id = $("#form-id")?.value || "";
  if (!id) return;
  if (!confirm("정말 삭제하시겠습니까?")) return;
  try {
    const r = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const txt = await r.text();
      alert("삭제 실패: " + txt);
      return;
    }
    hideModal();
    if ($("#my-daily")) loadMyDay();
    if ($("#calendar")) location.reload();
    if ($("#day-board")) loadDayAndRender();
    if ($("#res-table")) loadResults();
    if ($("#tbl-branch")) $("#dash-apply")?.click();
  } catch (e) {
    alert("삭제 오류: " + e.message);
  }
}

// -------------------- 대시보드 --------------------
async function initDashboard() {
  const fromEl = $("#dash-from"), toEl = $("#dash-to"), brEl = $("#dash-branch"), teamEl = $("#dash-team");
  if (!fromEl || !toEl || !brEl || !teamEl) return;

  // 기간 기본: 최근 30일
  const to = new Date(), from = new Date(); from.setDate(to.getDate() - 30);
  fromEl.value = toDateInput(from); toEl.value = toDateInput(to);

  brEl.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");
  teamEl.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");

  $("#dash-apply")?.addEventListener("click", loadDashboard);
  await loadDashboard();

  async function loadDashboard() {
    const params = new URLSearchParams({ from_date: fromEl.value, to_date: toEl.value });
    if (brEl.value) params.append("branch", brEl.value);
    if (teamEl.value) params.append("team", teamEl.value);
    const data = await fetchJSON("/api/stats/overview?" + params.toString());
    const fmt = (v) => (v === null || v === undefined) ? "-" : (v * 100).toFixed(1) + "%";

    $("#card-branch-reg") && ($("#card-branch-reg").textContent = fmt(data.cards.branch_registration_rate));
    $("#card-branch-counsel") && ($("#card-branch-counsel").textContent = fmt(data.cards.branch_counseling_rate));
    const cardReq = $("#card-subject-reg-req") || $("#card-subject-reg");
    if (cardReq) cardReq.textContent = fmt(data.cards.subject_registration_rate_request_basis ?? data.cards.subject_registration_rate);
    const cardReg = $("#card-subject-reg-reg");
    if (cardReg) cardReg.textContent = fmt(data.cards.subject_registration_rate_registered_basis);

    // 지점 표(라벨)
    const tb = $("#tbl-branch tbody");
    if (tb) {
      tb.innerHTML = "";
      for (const r of data.branch_stats) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${r.branch_label}</td>
          <td>${r.counseling}</td>
          <td>${r.registered}</td>
          <td>${r.total_db}</td>
          <td>${fmt(r.registration_rate)}</td>
          <td>${fmt(r.counseling_rate)}</td>
        `;
        tb.appendChild(tr);
      }
    }

    // 과목 표(신청 기준)
    const tReq = $("#tbl-subject-req tbody");
    if (tReq && data.subject_stats_request) {
      tReq.innerHTML = "";
      for (const s of data.subject_stats_request.slice().sort((a, b) => (b.registration_rate || 0) - (a.registration_rate || 0))) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${s.subject_name}</td>
          <td>${s.branch_label}</td>
          <td>${s.counseling}</td>
          <td>${s.registered}</td>
          <td>${fmt(s.registration_rate)}</td>
        `;
        tReq.appendChild(tr);
      }
    }

    // 과목 표(등록 기준·보조)
    const tReg = $("#tbl-subject-reg tbody");
    if (tReg && data.subject_stats_registered) {
      tReg.innerHTML = "";
      for (const s of data.subject_stats_registered.slice().sort((a, b) => (b.registration_rate_registered_basis || 0) - (a.registration_rate_registered_basis || 0))) {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${s.subject_name}</td>
          <td>${s.branch_label}</td>
          <td>${s.counseling_by_request}</td>
          <td>${s.registered_by_registered}</td>
          <td>${fmt(s.registration_rate_registered_basis)}</td>
        `;
        tReg.appendChild(tr);
      }
    }
  }
}

// -------------------- 주간 캘린더 --------------------
function initWeeklyCalendar() {
  const cal = $("#calendar");
  if (!cal) return;

  const weekStartInput = $("#week-start");
  const btnPrev = $("#btn-prev-week"), btnNext = $("#btn-next-week");
  const selBranch = $("#filter-branch"), selTeam = $("#filter-team"), selCounselor = $("#filter-counselor"), selMode = $("#filter-mode");

  // 옵션
  selBranch.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");
  selTeam.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");
  selCounselor.innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c => `<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  // 주 시작일
  let ws = startOfWeek(new Date());
  weekStartInput.value = toDateInput(ws);

  btnPrev?.addEventListener("click", () => { ws = addMinutes(ws, -7 * 24 * 60); weekStartInput.value = toDateInput(ws); loadAndRenderWeek(); });
  btnNext?.addEventListener("click", () => { ws = addMinutes(ws, 7 * 24 * 60); weekStartInput.value = toDateInput(ws); loadAndRenderWeek(); });
  weekStartInput?.addEventListener("change", (e) => { ws = startOfWeek(fromDateInput(e.target.value)); e.target.value = toDateInput(ws); loadAndRenderWeek(); });
  [selBranch, selTeam, selCounselor, selMode].forEach(el => el?.addEventListener("change", loadAndRenderWeek));

  // 시간 레일
  const scale = $("#time-scale");
  if (scale) {
    scale.innerHTML = "";
    for (let m = DAY_START; m <= DAY_END; m += SLOT_MIN) {
      const t = document.createElement("div");
      t.className = "time-slot";
      t.style.height = "24px";
      const h = Math.floor(m / 60), mm = m % 60;
      t.textContent = `${pad2(h)}:${pad2(mm)}`;
      scale.appendChild(t);
    }
  }

  // 헤더 라벨
  for (let i = 0; i < 7; i++) {
    const hdr = $(`#calendar .cal-header .day-col[data-day="${i}"]`);
    if (hdr) hdr.innerHTML = `<div class="day-label" id="day-label-${i}"></div>`;
  }

  // 클릭으로 새 일정
  $$("#calendar .cal-body .day-col.body").forEach((col, idx) => {
    col.addEventListener("click", (e) => {
      const rect = col.getBoundingClientRect(), y = e.clientY - rect.top;
      const minutesFromStart = Math.max(0, Math.min(DAY_END - DAY_START, Math.round(y / 24) * SLOT_MIN));
      const startMin = DAY_START + minutesFromStart, endMin = Math.min(DAY_END, startMin + 60);
      const d = addMinutes(ws, idx * 24 * 60);
      openSessionModal({
        id: "",
        date: toDateInput(d),
        start_time: `${pad2(Math.floor(startMin / 60))}:${pad2(startMin % 60)}`,
        end_time: `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`,
        counselor_id: "",
        branch: selBranch.value || "",
        team: selTeam.value || "",
        mode: selMode.value || "OFFLINE",
        status: "PENDING",
        requested_subject_id: "",
        registered_subject_id: "",
        cancel_reason: "",
        comment: ""
      }, "create");
    });
  });

  buildSessionModalCommon();
  loadAndRenderWeek();

  async function loadAndRenderWeek() {
    // 헤더 라벨
    for (let i = 0; i < 7; i++) {
      const d = addMinutes(ws, i * 24 * 60);
      const lbl = $(`#day-label-${i}`);
      if (lbl) lbl.textContent = `${["월", "화", "수", "목", "금", "토", "일"][i]} ${d.getMonth() + 1}/${d.getDate()}`;
    }
    const params = new URLSearchParams({
      from_date: toDateInput(ws),
      to_date: toDateInput(addMinutes(ws, 6 * 24 * 60))
    });
    if (selBranch.value) params.append("branch", selBranch.value);
    if (selTeam.value) params.append("team", selTeam.value);
    if (selCounselor.value) params.append("counselor_id", selCounselor.value);
    if (selMode.value) params.append("mode", selMode.value);

    const sessions = await fetchJSON("/api/sessions?" + params.toString()).catch(() => []);
    // 초기화
    $$("#calendar .cal-body .day-col.body").forEach(col => { col.innerHTML = ""; col.style.position = "relative"; col.style.height = ((DAY_END - DAY_START) / SLOT_MIN) * SLOT_HEIGHT + "px"; });

    // 날짜별 그룹 -> 렌더
    const byDate = new Map();
    for (const s of sessions) {
      if (!byDate.has(s.date)) byDate.set(s.date, []);
      byDate.get(s.date).push(s);
    }
    for (let i = 0; i < 7; i++) {
      const d = toDateInput(addMinutes(ws, i * 24 * 60));
      const list = (byDate.get(d) || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
      const col = $(`#calendar .cal-body .day-col.body[data-day="${i}"]`);
      for (const ev of list) {
        const el = document.createElement("div");
        const color = statusColor(ev.status);
        el.className = "event";
        el.style.top = posTopPx(ev.start_time) + "px";
        el.style.height = Math.max(20, heightPx(ev.start_time, ev.end_time)) + "px";
        el.style.background = color.bg; el.style.borderColor = color.border;
        el.title = `#${ev.counselor_id} ${ev.start_time.slice(0, 5)}~${ev.end_time.slice(0, 5)} (${ev.status})`;
        el.innerHTML = `<div class="ev-time">${ev.start_time.slice(0, 5)}~${ev.end_time.slice(0, 5)}</div><div class="ev-title">#${ev.counselor_id} ${ev.status}</div>`;
        el.addEventListener("click", (e) => { e.stopPropagation(); openSessionModal(ev, "edit"); });
        col.appendChild(el);
      }
    }
  }
}

// -------------------- 결과 관리 --------------------
function initResultsTable() {
  const table = $("#res-table");
  if (!table) return;

  $("#res-branch").innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");
  $("#res-team").innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");
  $("#res-counselor").innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c => `<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  const to = new Date(), from = new Date(); from.setDate(to.getDate() - 7);
  $("#res-from").value = toDateInput(from);
  $("#res-to").value = toDateInput(to);

  $("#res-apply")?.addEventListener("click", loadResults);
  $("#chk-all")?.addEventListener("change", (e) => { $$("#res-tbody input[type='checkbox']").forEach(ch => ch.checked = e.target.checked); });

  $("#batch-registered").innerHTML = `<option value="">등록 과목 선택</option>`;
  $("#batch-apply")?.addEventListener("click", onBatchApply);

  loadResults();
}

async function loadResults() {
  const tbody = $("#res-tbody");
  if (!tbody) return;

  const params = new URLSearchParams({ from_date: $("#res-from").value, to_date: $("#res-to").value });
  const b = $("#res-branch").value, t = $("#res-team").value, c = $("#res-counselor").value, m = $("#res-mode").value, s = $("#res-status").value;
  if (b) params.append("branch", b);
  if (t) params.append("team", t);
  if (c) params.append("counselor_id", c);
  if (m) params.append("mode", m);
  if (s) params.append("status", s);

  // 일괄 등록 과목 드롭다운(지점 기준)
  const regSel = $("#batch-registered");
  if (b && regSel) {
    const subs = await ensureSubjects(b);
    regSel.innerHTML = `<option value="">등록 과목 선택</option>` + subs.map(x => `<option value="${x.id}">${x.name}</option>`).join("");
  } else if (regSel) {
    regSel.innerHTML = `<option value="">등록 과목 선택</option>`;
  }

  const list = await fetchJSON("/api/sessions?" + params.toString()).catch(() => []);
  tbody.innerHTML = "";
  const subjMap = new Map(); Meta.subjectsByBranch.forEach(arr => arr.forEach(s => subjMap.set(s.id, s.name)));
  const counselorMap = new Map(Meta.counselors.map(c => [c.id, c.name]));
  for (const s of list) {
    const tr = document.createElement("tr");
    const reqName = subjMap.get(s.requested_subject_id) || "";
    const regName = subjMap.get(s.registered_subject_id) || "";
    tr.innerHTML = `
      <td><input type="checkbox" data-id="${s.id}"></td>
      <td>${s.date}</td>
      <td>${s.start_time.slice(0, 5)}~${s.end_time.slice(0, 5)}</td>
      <td>${s.branch}</td>
      <td>${s.team}</td>
      <td>${counselorMap.get(s.counselor_id) || ("#"+s.counselor_id)}</td>
      <td>${reqName}</td>
      <td>${s.status}</td>
      <td>${regName}</td>
      <td>${s.cancel_reason || ""}</td>
      <td>${s.mode === "REMOTE" ? "비" : "오프"}</td>
      <td>${s.comment || ""}</td>
    `;
    tr.addEventListener("dblclick", () => openSessionModal(s, "edit"));
    tbody.appendChild(tr);
  }
}

async function onBatchApply() {
  const ids = $$("#res-tbody input[type='checkbox']:checked").map(ch => +ch.dataset.id);
  if (ids.length === 0) { alert("선택된 항목이 없습니다."); return; }
  const payload = {
    ids,
    status: $("#batch-status").value || null,
    registered_subject_id: $("#batch-registered").value ? +$("#batch-registered").value : null,
    cancel_reason: $("#batch-cancel").value || null,
    comment: $("#batch-comment").value || null
  };
  try {
    const r = await fetchJSON("/api/sessions/batch/update-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    alert(`일괄 변경 완료: ${r.updated}건`);
    await loadResults();
  } catch (e) {
    alert("일괄 변경 실패: " + e.message);
  }
}

// -------------------- 일자 타임라인 --------------------
function initDayTimeline() {
  const board = $("#day-board");
  if (!board) return;

  $("#day-branch").innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");
  $("#day-team").innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");

  const today = new Date(); $("#day-date").value = toDateInput(today);
  $("#day-prev")?.addEventListener("click", () => { const d = fromDateInput($("#day-date").value); d.setDate(d.getDate() - 1); $("#day-date").value = toDateInput(d); loadDayAndRender(); });
  $("#day-next")?.addEventListener("click", () => { const d = fromDateInput($("#day-date").value); d.setDate(d.getDate() + 1); $("#day-date").value = toDateInput(d); loadDayAndRender(); });
  ["day-branch", "day-team", "day-mode", "day-date"].forEach(id => $("#" + id)?.addEventListener("change", loadDayAndRender));

  const rail = $("#day-time-rail"); if (rail) {
    rail.innerHTML = "";
    for (let m = DAY_START; m <= DAY_END; m += SLOT_MIN) {
      const div = document.createElement("div"); div.className = "time-slot"; div.style.height = "24px";
      const h = Math.floor(m / 60), mm = m % 60; div.textContent = `${pad2(h)}:${pad2(mm)}`;
      rail.appendChild(div);
    }
  }
  loadDayAndRender();
}

async function loadDayAndRender() {
  const d = $("#day-date")?.value;
  if (!d) return;
  const params = new URLSearchParams({ from_date: d, to_date: d });
  const b = $("#day-branch")?.value, t = $("#day-team")?.value, m = $("#day-mode")?.value;
  if (b) params.append("branch", b);
  if (t) params.append("team", t);
  if (m) params.append("mode", m);
  const list = await fetchJSON("/api/sessions?" + params.toString()).catch(() => []);
  renderDayRows(list);
}

function renderDayRows(list) {
  const rowsEl = $("#day-rows");
  if (!rowsEl) return;
  rowsEl.innerHTML = "";

  const byCounselor = new Map();
  for (const s of list) {
    if (!byCounselor.has(s.counselor_id)) byCounselor.set(s.counselor_id, []);
    byCounselor.get(s.counselor_id).push(s);
  }
  const nameOf = (id) => (Meta.counselors.find(c => c.id === id)?.name || ("#" + id));

  for (const [cid, arr] of byCounselor.entries()) {
    const row = document.createElement("div"); row.className = "day-row";
    row.innerHTML = `<div class="row-head">${nameOf(cid)}</div><div class="row-body"></div>`;
    const body = row.querySelector(".row-body"); body.style.position = "relative"; body.style.height = ((DAY_END - DAY_START) / SLOT_MIN) * SLOT_HEIGHT + "px";
    for (const ev of arr.sort((a, b) => a.start_time.localeCompare(b.start_time))) {
      const el = document.createElement("div"); el.className = "event";
      const color = statusColor(ev.status);
      el.style.top = posTopPx(ev.start_time) + "px"; el.style.height = Math.max(20, heightPx(ev.start_time, ev.end_time)) + "px";
      el.style.background = color.bg; el.style.borderColor = color.border;
      el.title = `${ev.start_time.slice(0, 5)}~${ev.end_time.slice(0, 5)} (${ev.status})`;
      el.innerHTML = `<div class="ev-time">${ev.start_time.slice(0, 5)}~${ev.end_time.slice(0, 5)}</div><div class="ev-title">${ev.status}</div>`;
      el.addEventListener("click", () => openSessionModal(ev, "edit"));
      body.appendChild(el);
    }
    rowsEl.appendChild(row);
  }
}

// -------------------- 일별 DB 입력(지점/팀) --------------------
function initAdminDB() {
  const branchTable = $("#db-table-branch");
  const teamTable = $("#db-table-team");
  if (!branchTable && !teamTable) return;

  // 지점 입력
  const dateB = $("#db-date-branch"), selB = $("#db-branch"), cntB = $("#db-count-branch"), btnB = $("#db-save-branch");
  const toB = $("#db-to-branch"), fromB = $("#db-from-branch"), fSelB = $("#db-filter-branch"), btnLB = $("#db-load-branch"), tbodyB = $("#db-table-branch tbody");
  // 팀 입력
  const dateT = $("#db-date-team"), selT = $("#db-team"), cntT = $("#db-count-team"), btnT = $("#db-save-team");
  const toT = $("#db-to-team"), fromT = $("#db-from-team"), fSelT = $("#db-filter-team"), btnLT = $("#db-load-team"), tbodyT = $("#db-table-team tbody");

  const today = new Date(); if (dateB) dateB.value = toDateInput(today); if (dateT) dateT.value = toDateInput(today);

  if (selB) selB.innerHTML = Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");
  if (fSelB) fSelB.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");

  if (selT) selT.innerHTML = Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");
  if (fSelT) fSelT.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");

  const to = new Date(), from = new Date(); from.setDate(to.getDate() - 7);
  if (toB && fromB) { toB.value = toDateInput(to); fromB.value = toDateInput(from); }
  if (toT && fromT) { toT.value = toDateInput(to); fromT.value = toDateInput(from); }

  btnB?.addEventListener("click", async () => {
    try {
      await fetchJSON("/api/daily-db", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateB.value, branch: selB.value, db_count: parseInt(cntB.value || "0", 10) })
      });
      alert("지점 DB 저장 완료");
      await loadBranchList();
    } catch (e) { alert("지점 DB 저장 실패: " + e.message); }
  });

  btnT?.addEventListener("click", async () => {
    try {
      await fetchJSON("/api/daily-db-team", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateT.value, team: selT.value, db_count: parseInt(cntT.value || "0", 10) })
      });
      alert("팀 DB 저장 완료");
      await loadTeamList();
    } catch (e) { alert("팀 DB 저장 실패: " + e.message); }
  });

  btnLB?.addEventListener("click", loadBranchList);
  btnLT?.addEventListener("click", loadTeamList);

  loadBranchList();
  loadTeamList();

  async function loadBranchList() {
    if (!tbodyB) return;
    const all = await fetchJSON("/api/daily-db").catch(() => []);
    const fromV = fromDateInput(fromB.value), toV = fromDateInput(toB.value), fb = fSelB.value;
    const rows = all.filter(r => {
      const d = fromDateInput(r.date);
      return d >= fromV && d <= toV && (!fb || r.branch === fb);
    }).sort((a, b) => (a.date === b.date ? a.branch.localeCompare(b.branch) : b.date.localeCompare(a.date)));
    tbodyB.innerHTML = rows.map(r => `<tr><td>${r.date}</td><td>${r.branch}</td><td>${r.db_count}</td></tr>`).join("") || `<tr><td colspan="3">데이터 없음</td></tr>`;
  }
  async function loadTeamList() {
    if (!tbodyT) return;
    const all = await fetchJSON("/api/daily-db-team").catch(() => []);
    const fromV = fromDateInput(fromT.value), toV = fromDateInput(toT.value), ft = fSelT.value;
    const rows = all.filter(r => {
      const d = fromDateInput(r.date);
      return d >= fromV && d <= toV && (!ft || r.team === ft);
    }).sort((a, b) => (a.date === b.date ? a.team.localeCompare(b.team) : b.date.localeCompare(a.date)));
    tbodyT.innerHTML = rows.map(r => `<tr><td>${r.date}</td><td>${r.team}</td><td>${r.db_count}</td></tr>`).join("") || `<tr><td colspan="3">데이터 없음</td></tr>`;
  }
}

// -------------------- 내 일자 등록 --------------------
async function initMyDaily() {
  const board = $("#my-daily");
  if (!board) return;

  const myDate = $("#my-date"), mySel = $("#my-counselor"), head = $("#my-row-head"), ctx = $("#my-ctx");
  mySel.innerHTML = `<option value="">상담사 선택</option>` + Meta.counselors.map(c => `<option value="${c.id}" data-branch="${c.branch}" data-team="${c.team}">${c.name} (${c.branch}/${c.team})</option>`).join("");
  const today = new Date(); if (myDate) myDate.value = toDateInput(today);

  // 시간 레일
  const rail = $("#my-time-rail");
  if (rail) {
    rail.innerHTML = "";
    for (let m = DAY_START; m <= DAY_END; m += SLOT_MIN) {
      const div = document.createElement("div"); div.className = "time-slot"; div.style.height = "24px";
      const h = Math.floor(m / 60), mm = m % 60; div.textContent = `${pad2(h)}:${pad2(mm)}`;
      rail.appendChild(div);
    }
  }
  const body = $("#my-row-body");
  if (body) {
    body.style.position = "relative";
    body.style.height = ((DAY_END - DAY_START) / SLOT_MIN) * SLOT_HEIGHT + "px";
    // 클릭 생성
    body.addEventListener("click", (e) => {
      const rect = body.getBoundingClientRect(), y = e.clientY - rect.top;
      const minutesFromStart = Math.max(0, Math.min(DAY_END - DAY_START, Math.round(y / 24) * SLOT_MIN));
      const startMin = DAY_START + minutesFromStart, endMin = Math.min(DAY_END, startMin + 60);
      const cId = mySel.value ? +mySel.value : null;
      if (!cId) { alert("상담사를 먼저 선택해 주세요."); return; }
      const c = Meta.counselors.find(x => x.id === cId);
      openSessionModal({
        id: "",
        date: myDate.value,
        start_time: `${pad2(Math.floor(startMin / 60))}:${pad2(startMin % 60)}`,
        end_time: `${pad2(Math.floor(endMin / 60))}:${pad2(endMin % 60)}`,
        counselor_id: cId, branch: c.branch, team: c.team,
        mode: "OFFLINE", status: "PENDING",
        requested_subject_id: "", registered_subject_id: "", cancel_reason: "", comment: ""
      }, "create");
    });
  }

  mySel.addEventListener("change", () => {
    const opt = mySel.selectedOptions[0];
    const name = mySel.value ? (Meta.counselors.find(x => x.id === +mySel.value)?.name) : "선택된 상담사";
    if (head) head.textContent = name || "선택된 상담사";
    const br = opt?.dataset.branch || "-"; const tm = opt?.dataset.team || "-";
    if (ctx) ctx.textContent = `지점/팀: ${br} / ${tm}`;
    loadMyDay();
  });
  myDate.addEventListener("change", loadMyDay);

  buildSessionModalCommon();
  loadMyDay();
}
async function loadMyDay() {
  const mySel = $("#my-counselor"); const cId = mySel?.value ? +mySel.value : null;
  const body = $("#my-row-body");
  if (!body) return;
  body.innerHTML = "";
  if (!cId) return;
  const d = $("#my-date")?.value; if (!d) return;
  const params = new URLSearchParams({ from_date: d, to_date: d, counselor_id: String(cId) });
  const list = await fetchJSON("/api/sessions?" + params.toString()).catch(() => []);
  for (const ev of list.sort((a, b) => a.start_time.localeCompare(b.start_time))) {
    const color = statusColor(ev.status);
    const el = document.createElement("div"); el.className = "event";
    el.style.top = posTopPx(ev.start_time) + "px"; el.style.height = Math.max(20, heightPx(ev.start_time, ev.end_time)) + "px";
    el.style.background = color.bg; el.style.borderColor = color.border;
    el.title = `${ev.start_time.slice(0, 5)}~${ev.end_time.slice(0, 5)} (${ev.status})`;
    el.innerHTML = `<div class="ev-time">${ev.start_time.slice(0, 5)}~${ev.end_time.slice(0, 5)}</div><div class="ev-title">${ev.status}</div>`;
    el.addEventListener("click", () => openSessionModal(ev, "edit"));
    body.appendChild(el);
  }
}

// -------------------- 월간 캘린더 --------------------
function daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }
function firstWeekday(year, month) { const d = new Date(year, month, 1); return (d.getDay() + 6) % 7; /* 월=0 기준 */ }

function initMonthlyCalendar() {
  const board = $("#month-board");
  if (!board) return;

  const ymEl = $("#mon-ym"), prev = $("#mon-prev"), next = $("#mon-next");
  const bSel = $("#mon-branch"), tSel = $("#mon-team"), cSel = $("#mon-counselor"), mSel = $("#mon-mode");

  bSel.innerHTML = `<option value="">지점 전체</option>` + Meta.branches.filter(b => b.active).map(b => `<option value="${b.code}">${b.label_ko}</option>`).join("");
  tSel.innerHTML = `<option value="">팀 전체</option>` + Meta.teams.filter(t => t.active).map(t => `<option value="${t.code}">${t.label_ko}</option>`).join("");
  cSel.innerHTML = `<option value="">상담사 전체</option>` + Meta.counselors.map(c => `<option value="${c.id}">${c.name} (${c.branch}/${c.team})</option>`).join("");

  const today = new Date(); ymEl.value = toMonthInput(today);
  prev?.addEventListener("click", () => { const d = fromMonthInput(ymEl.value); d.setMonth(d.getMonth() - 1); ymEl.value = toMonthInput(d); loadAndRenderMonth(); });
  next?.addEventListener("click", () => { const d = fromMonthInput(ymEl.value); d.setMonth(d.getMonth() + 1); ymEl.value = toMonthInput(d); loadAndRenderMonth(); });
  [ymEl, bSel, tSel, cSel, mSel].forEach(el => el?.addEventListener("change", loadAndRenderMonth));

  buildSessionModalCommon();
  loadAndRenderMonth();
}

async function loadAndRenderMonth() {
  const ym = $("#mon-ym")?.value; if (!ym) return;
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const from = toDateInput(first), to = toDateInput(last);

  const b = $("#mon-branch")?.value, t = $("#mon-team")?.value, c = $("#mon-counselor")?.value, mode = $("#mon-mode")?.value;
  const params = new URLSearchParams({ from_date: from, to_date: to });
  if (b) params.append("branch", b);
  if (t) params.append("team", t);
  if (c) params.append("counselor_id", c);
  if (mode) params.append("mode", mode);

  const list = await fetchJSON("/api/sessions?" + params.toString()).catch(() => []);
  renderMonthGrid(list, y, m - 1);
}

function renderMonthGrid(sessions, year, month) {
  const grid = $("#month-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const fd = firstWeekday(year, month); // 0..6 (월=0)
  const dim = daysInMonth(year, month);
  const totalCells = Math.ceil((fd + dim) / 7) * 7;

  const byDate = new Map();
  for (const s of sessions) {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date).push(s);
  }

  for (let i = 0; i < totalCells; i++) {
    const cell = document.createElement("div");
    cell.className = "month-cell";
    const dayNum = i - fd + 1;
    if (dayNum < 1 || dayNum > dim) {
      cell.classList.add("dim");
      grid.appendChild(cell);
      continue;
    }
    const dateStr = `${year}-${pad2(month + 1)}-${pad2(dayNum)}`;
    const header = document.createElement("div");
    header.className = "month-cell-head";
    header.textContent = String(dayNum);
    const body = document.createElement("div");
    body.className = "month-cell-body";

    const list = (byDate.get(dateStr) || []).slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
    for (const ev of list) {
      const item = document.createElement("div");
      const col = statusColor(ev.status);
      item.className = "month-item";
      item.style.background = col.bg;
      item.style.borderColor = col.border;
      item.title = `#${ev.counselor_id} ${ev.start_time.slice(0, 5)}~${ev.end_time.slice(0, 5)} (${ev.status})`;
      item.textContent = `${ev.start_time.slice(0, 5)} ${ev.status}`;
      item.addEventListener("click", (e) => { e.stopPropagation(); openSessionModal(ev, "edit"); });
      body.appendChild(item);
    }

    cell.appendChild(header);
    cell.appendChild(body);
    cell.addEventListener("click", () => {
      openSessionModal({
        id: "",
        date: dateStr,
        start_time: "10:00",
        end_time: "11:00",
        counselor_id: $("#mon-counselor")?.value ? +$("#mon-counselor").value : "",
        branch: $("#mon-branch")?.value || "",
        team: $("#mon-team")?.value || "",
        mode: $("#mon-mode")?.value || "OFFLINE",
        status: "PENDING",
        requested_subject_id: "",
        registered_subject_id: "",
        cancel_reason: "",
        comment: ""
      }, "create");
    });
    grid.appendChild(cell);
  }
}

// -------------------- 엔트리 --------------------
document.addEventListener("DOMContentLoaded", async () => {
  await loadMetaCommon();

  // 페이지 별 초기화
  if ($("#tbl-branch")) initDashboard();
  if ($("#calendar")) initWeeklyCalendar();
  if ($("#res-table")) initResultsTable();
  if ($("#day-board")) initDayTimeline();
  if ($("#db-table-branch") || $("#db-table-team")) initAdminDB();
  if ($("#my-daily")) initMyDaily();
  if ($("#month-board")) initMonthlyCalendar();
});
