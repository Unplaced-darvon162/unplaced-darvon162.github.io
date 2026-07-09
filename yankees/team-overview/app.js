const TEAM_ID = 147;
const SEASON = new Date().getFullYear();
const MLB_API = "https://statsapi.mlb.com/api/v1";

const metricConfig = [
  { key: "runs", label: "Runs Scored", badge: "RS", group: "hitting", rank: "desc" },
  { key: "runsAllowed", label: "Runs Allowed", badge: "RA", group: "pitching", rank: "asc" },
  { key: "avg", label: "Team AVG", badge: "AVG", group: "hitting", rank: "desc" },
  { key: "ops", label: "Team OPS", badge: "OPS", group: "hitting", rank: "desc" },
  { key: "obp", label: "OBP", badge: "OBP", group: "hitting", rank: "desc" },
  { key: "homeRuns", label: "Home Runs", badge: "HR", group: "hitting", rank: "desc" },
  { key: "era", label: "Team ERA", badge: "ERA", group: "pitching", rank: "asc" },
];

const els = {
  status: document.querySelector("#data-status"),
  viewTitle: document.querySelector("#view-title"),
  viewCopy: document.querySelector("#view-copy"),
  overviewPanel: document.querySelector("#overview-panel"),
  comparePanel: document.querySelector("#compare-panel"),
  overviewButton: document.querySelector("#overview-view"),
  compareButton: document.querySelector("#compare-view"),
  yankeesCard: document.querySelector("#yankees-card"),
  compareYankeesCard: document.querySelector("#compare-yankees-card"),
  comparisonCard: document.querySelector("#comparison-card"),
  teamSearch: document.querySelector("#team-search"),
  teamOptions: document.querySelector("#team-options"),
  compareSubmit: document.querySelector("#compare-button"),
};

const state = {
  teams: [],
  teamMap: new Map(),
  standings: new Map(),
  hitting: new Map(),
  pitching: new Map(),
  ranks: new Map(),
};

const api = {
  async get(path, params = {}) {
    const url = new URL(`${MLB_API}${path}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url);
    if (!response.ok) throw new Error(`MLB API returned ${response.status}`);
    return response.json();
  },
  teams() {
    return this.get("/teams", { sportId: 1, season: SEASON });
  },
  stats(group) {
    return this.get("/teams/stats", { stats: "season", group, sportIds: 1, season: SEASON });
  },
  standings() {
    return this.get("/standings", { leagueId: "103,104", season: SEASON, standingsTypes: "regularSeason" });
  },
};

function setStatus(message, tone = "neutral") {
  els.status.textContent = message;
  els.status.style.color = tone === "error" ? "#ffbec4" : tone === "good" ? "#9af0c8" : "";
}

function ordinal(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  const suffix = number % 100 >= 11 && number % 100 <= 13 ? "th" : { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
  return `${number}${suffix}`;
}

function statNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatStat(key, value) {
  if (value === undefined || value === null || value === "") return "-";
  if (["avg", "ops", "obp"].includes(key)) return String(value).replace(/^0/, "");
  return String(value);
}

function normalizeTeam(team) {
  return `${team.name} ${team.teamName} ${team.locationName} ${team.clubName} ${team.abbreviation}`.toLowerCase();
}

function storeStats(group, data) {
  const target = group === "hitting" ? state.hitting : state.pitching;
  const splits = data.stats?.[0]?.splits || [];
  splits.forEach((split) => {
    target.set(split.team.id, split.stat || {});
  });
}

function storeStandings(data) {
  (data.records || []).forEach((division) => {
    (division.teamRecords || []).forEach((record) => {
      state.standings.set(record.team.id, {
        wins: record.leagueRecord?.wins ?? "-",
        losses: record.leagueRecord?.losses ?? "-",
        divisionRank: record.divisionRank,
        divisionName: division.division?.name || "",
      });
    });
  });
}

function metricValue(teamId, metric) {
  const stats = metric.group === "hitting" ? state.hitting.get(teamId) : state.pitching.get(teamId);
  if (metric.key === "runsAllowed") return stats?.runs;
  return stats?.[metric.key];
}

function calculateRanks() {
  metricConfig.forEach((metric) => {
    const ranked = state.teams
      .map((team) => ({ teamId: team.id, value: statNumber(metricValue(team.id, metric)) }))
      .filter((item) => item.value !== null)
      .sort((a, b) => metric.rank === "asc" ? a.value - b.value : b.value - a.value);

    const ranks = new Map();
    ranked.forEach((item, index) => {
      ranks.set(item.teamId, index + 1);
    });
    state.ranks.set(metric.key, ranks);
  });
}

function divisionShortName(name) {
  return name
    .replace("American League", "AL")
    .replace("National League", "NL");
}

function teamOverview(teamId) {
  const team = state.teamMap.get(teamId);
  const standing = state.standings.get(teamId) || {};
  const divisionName = standing.divisionName || team?.division?.name || "";
  return {
    team,
    standing,
    record: `${standing.wins ?? "-"}-${standing.losses ?? "-"}`,
    standingLine: standing.divisionRank ? `${ordinal(standing.divisionRank)} in ${divisionShortName(divisionName)}` : "Standing unavailable",
  };
}

function renderMetric(teamId, metric) {
  const template = document.querySelector("#metric-template");
  const node = template.content.firstElementChild.cloneNode(true);
  const value = metricValue(teamId, metric);
  const rank = state.ranks.get(metric.key)?.get(teamId);
  node.querySelector(".metric-badge").textContent = metric.badge;
  node.querySelector("strong").textContent = metric.label;
  node.querySelector(".metric-value span").textContent = formatStat(metric.key, value);
  node.querySelector(".metric-value small").textContent = rank ? ordinal(rank) : "-";
  return node;
}

function renderCard(target, teamId) {
  const overview = teamOverview(teamId);
  if (!overview.team) {
    target.innerHTML = `<p class="error mb-0">Team data is unavailable.</p>`;
    return;
  }

  target.replaceChildren();
  const header = document.createElement("header");
  header.className = "team-header";
  header.innerHTML = `
    <p class="panel-kicker mb-2">${overview.team.league?.abbreviation || "MLB"} · ${overview.team.division?.name || "Division"}</p>
    <h3 class="team-name">${overview.team.name}</h3>
    <div class="record-line mt-3">${overview.record}</div>
    <div class="standing-line">${overview.standingLine}</div>
  `;

  const list = document.createElement("section");
  list.className = "metric-list";
  metricConfig.forEach((metric) => list.append(renderMetric(teamId, metric)));

  target.append(header, list);
}

function showView(view) {
  const compare = view === "compare";
  els.overviewPanel.hidden = compare;
  els.comparePanel.hidden = !compare;
  els.overviewButton.classList.toggle("active", !compare);
  els.compareButton.classList.toggle("active", compare);
  els.viewTitle.textContent = compare ? "Compare Teams" : "Yankees Stats";
  els.viewCopy.textContent = compare
    ? "Search another MLB team and compare the same overview metrics against the Yankees."
    : "Record, division standing, and core team ranks across MLB.";
}

function findTeam(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  return state.teams.find((team) => normalizeTeam(team) === normalized)
    || state.teams.find((team) => normalizeTeam(team).includes(normalized));
}

function populateTeams() {
  els.teamOptions.replaceChildren();
  state.teams
    .filter((team) => team.id !== TEAM_ID)
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((team) => {
      const option = document.createElement("option");
      option.value = team.name;
      option.label = team.abbreviation;
      els.teamOptions.append(option);
    });
}

function compareTeam() {
  const team = findTeam(els.teamSearch.value);
  if (!team || team.id === TEAM_ID) {
    els.comparisonCard.innerHTML = `<p class="error mb-0">Choose another MLB team to compare against the Yankees.</p>`;
    return;
  }
  renderCard(els.compareYankeesCard, TEAM_ID);
  renderCard(els.comparisonCard, team.id);
}

function bindEvents() {
  els.overviewButton.addEventListener("click", () => showView("overview"));
  els.compareButton.addEventListener("click", () => showView("compare"));
  els.compareSubmit.addEventListener("click", compareTeam);
  els.teamSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") compareTeam();
  });
}

async function init() {
  bindEvents();
  setStatus("Loading team data");
  try {
    const [teams, hitting, pitching, standings] = await Promise.all([
      api.teams(),
      api.stats("hitting"),
      api.stats("pitching"),
      api.standings(),
    ]);

    state.teams = (teams.teams || []).filter((team) => team.active);
    state.teams.forEach((team) => state.teamMap.set(team.id, team));
    storeStats("hitting", hitting);
    storeStats("pitching", pitching);
    storeStandings(standings);
    calculateRanks();
    populateTeams();

    renderCard(els.yankeesCard, TEAM_ID);
    renderCard(els.compareYankeesCard, TEAM_ID);
    els.teamSearch.value = "Boston Red Sox";
    compareTeam();
    showView("overview");
    setStatus("Live MLB data", "good");
  } catch (error) {
    setStatus("Data connection issue", "error");
    els.yankeesCard.innerHTML = `<p class="error mb-0">Could not load team overview data. ${error.message}</p>`;
  }
}

init();
