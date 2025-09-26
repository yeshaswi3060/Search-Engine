const API_BASE = "http://localhost:8080";

const qInput = document.getElementById("q");
const btnSearch = document.getElementById("btnSearch");
const alphaRange = document.getElementById("alpha");
const statusDot = document.getElementById("status-dot");
const chips = document.querySelectorAll(".chip");
const tagsSelect = document.getElementById("tags");
const resultsEl = document.getElementById("results");
const stateInitial = document.getElementById("state-initial");
const stateLoading = document.getElementById("state-loading");
const stateError = document.getElementById("state-error");
const errBanner = document.getElementById("error-banner");
const stateEmpty = document.getElementById("state-empty");
const pagination = document.getElementById("pagination");
const prevBtn = document.getElementById("prev");
const nextBtn = document.getElementById("next");
const pageInfo = document.getElementById("page-info");
const queryTime = document.getElementById("query-time");
const countEl = document.getElementById("count");
const vectorPill = document.getElementById("vector-pill");

let state = {
  page: 1,
  pageSize: 10,
  lastCount: 0,
  type: "all",
  tags: [],
  alpha: 0.6,
};

function setStatus(ok) {
  statusDot.className = "status-dot " + (ok ? "green" : "red");
  statusDot.title = ok ? "Healthy" : "Unreachable";
}

async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    setStatus(res.ok);
  } catch {
    setStatus(false);
  }
}

function setState(view) {
  [stateInitial, stateLoading, stateError, stateEmpty, resultsEl, pagination].forEach(el => el.classList.add("hidden"));
  if (view === "initial") stateInitial.classList.remove("hidden");
  if (view === "loading") stateLoading.classList.remove("hidden");
  if (view === "error") stateError.classList.remove("hidden");
  if (view === "empty") stateEmpty.classList.remove("hidden");
  if (view === "results") {
    resultsEl.classList.remove("hidden");
    pagination.classList.remove("hidden");
  }
}

function extractSelectedTags() {
  return Array.from(tagsSelect.selectedOptions).map(o => o.value);
}

function buildFilters() {
  const filters = {};
  if (state.type !== "all") filters.source_type = [state.type];
  if (state.tags.length) filters.tags = state.tags;
  return Object.keys(filters).length ? filters : undefined;
}

function renderResults(hits) {
  resultsEl.innerHTML = "";
  hits.forEach(h => {
    const card = document.createElement("div");
    card.className = "card";
    const badgeClass = h.source_type === "product" ? "product" : (h.source_type === "pdf" ? "pdf" : "web");
    const url = h.url_or_path || "#";
    const title = h.title || h.id;
    const tags = (h.tags || []).map(t => `<span class="tag">${t}</span>`).join(" ");
    const pub = h.published_at ? new Date(h.published_at).toLocaleDateString() : "";
    const metaParts = [];
    if (tags) metaParts.push(tags);
    if (pub) metaParts.push(`<span>${pub}</span>`);

    card.innerHTML = `
      <div class="title">
        <a href="${url}" target="_blank" rel="noopener">${title}</a>
        <span class="badge ${badgeClass}">${h.source_type === "pdf" ? "Doc" : (h.source_type === "product" ? "Product" : "Web")}</span>
      </div>
      <div class="snippet">${h.snippet || ""}</div>
      <div class="meta">
        ${metaParts.join(" ")}
        <div class="url" title="${url}">${url}</div>
      </div>
    `;
    resultsEl.appendChild(card);
  });
}

function updateFooter(tookMs, count, vectorUsed) {
  queryTime.textContent = `${tookMs} ms`;
  countEl.textContent = `${count} results`;
  vectorPill.textContent = vectorUsed ? "Vector ON" : "Vector OFF";
  vectorPill.className = `pill ${vectorUsed ? "green" : "gray"}`;
}

function updatePagination(count) {
  const totalPages = Math.max(1, Math.ceil(count / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  pageInfo.textContent = `Page ${state.page} / ${totalPages}`;
  prevBtn.disabled = state.page <= 1;
  nextBtn.disabled = state.page >= totalPages;
}

let debounceTimer = null;
function debounceSearch() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => doSearch(), 350);
}

async function doSearch() {
  const q = qInput.value.trim();
  if (!q) {
    setState("initial");
    return;
  }
  setState("loading");
  state.tags = extractSelectedTags();
  try {
    const body = {
      q,
      limit: state.pageSize,
      alpha: state.alpha,
      filters: buildFilters(),
    };
    const res = await fetch(`${API_BASE}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    const hits = data.hits || [];
    state.lastCount = hits.length; // PoC: we only know this page count; extend API later for total
    if (!hits.length) {
      setState("empty");
      updateFooter(data.took_ms ?? 0, 0, data.vector_used ?? false);
      updatePagination(0);
      return;
    }
    renderResults(hits);
    setState("results");
    updateFooter(data.took_ms ?? 0, hits.length, data.vector_used ?? false);
    updatePagination(hits.length);
  } catch (e) {
    errBanner.textContent = `Error fetching results (${e.message || e})`;
    setState("error");
  }
}

function setActiveChip(type) {
  chips.forEach(c => c.classList.toggle("active", c.dataset.type === type));
}

function attachEvents() {
  btnSearch.addEventListener("click", () => { state.page = 1; doSearch(); });
  qInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { state.page = 1; doSearch(); }});
  qInput.addEventListener("input", debounceSearch);
  alphaRange.addEventListener("input", () => { state.alpha = parseFloat(alphaRange.value); debounceSearch(); });
  chips.forEach(c => c.addEventListener("click", () => { state.type = c.dataset.type; setActiveChip(state.type); state.page = 1; debounceSearch(); }));
  tagsSelect.addEventListener("change", () => { state.page = 1; debounceSearch(); });
  prevBtn.addEventListener("click", () => { if (state.page>1) { state.page--; debounceSearch(); }});
  nextBtn.addEventListener("click", () => { state.page++; debounceSearch(); });
  window.addEventListener("keydown", (e) => { if (e.key === "/") { e.preventDefault(); qInput.focus(); } });
}

async function loadFacets() {
  try {
    const res = await fetch(`${API_BASE}/facets`);
    const data = await res.json();
    const tags = Object.keys(data.tags || {});
    tagsSelect.innerHTML = tags.map(t => `<option value="${t}">${t}</option>`).join("");
  } catch {
    // ignore for PoC
  }
}

async function init() {
  attachEvents();
  await checkHealth();
  await loadFacets();
}

init();
