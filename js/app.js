import { checkHealth, getRecords, saveRecord } from "./api.js";
import { validateFilters, validateProduction } from "./validation.js";

const views = ["inicio", "registro", "historico", "indicadores"];
const labels = { inicio: "Início", registro: "Registrar produção", historico: "Histórico", indicadores: "Indicadores" };
const recordsByView = new Map();
let pendingRequestId = null;
let pendingRequestFingerprint = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function navigate(view) {
  if (!views.includes(view)) view = "inicio";
  for (const name of views) $(`#view-${name}`).hidden = name !== view;
  $$("[data-view]").forEach(button => {
    if (button.closest(".bottom-nav")) {
      if (button.dataset.view === view) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  document.title = `${labels[view]} | Santher | Controle de Refugo`;
  if (location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
  if (view === "historico") loadHistory();
  if (view === "indicadores") loadDashboard();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeZone: "America/Sao_Paulo" }).format(date);
}

function formatDate(isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate || "")) return isoDate || "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
}

function setConnection(online, message) {
  const status = $("#connection-status");
  status.textContent = message;
  status.dataset.state = online ? "online" : "offline";
}

async function refreshHome() {
  const total = $("#home-today-total");
  const error = $("#home-error");
  total.textContent = "Carregando…";
  error.hidden = true;
  try {
    const { records } = await getRecords({ from: todayISO(), to: todayISO() });
    total.textContent = formatNumber(sumWeight(records));
  } catch (cause) {
    total.textContent = "Indisponível";
    error.textContent = cause.message;
    error.hidden = false;
  }
}

function todayISO() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function sum(records) {
  return records.reduce((total, record) => total + Number(record.quantity), 0);
}

function sumWeight(records) {
  return records.reduce((total, record) => total + (Number(record.weight) || 0) * Number(record.quantity), 0);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value);
}

function getFilterValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function clearFilterError(element, text) {
  element.textContent = text;
  element.classList.toggle("feedback--error", Boolean(text));
}

async function loadHistory(filters = getFilterValues($("#history-filters"))) {
  const status = $("#history-status");
  const list = $("#history-list");
  const error = validateFilters(filters);
  if (error) { status.textContent = error; status.className = "feedback feedback--error"; return; }
  status.className = "muted";
  status.textContent = "Carregando registros…";
  list.replaceChildren();
  try {
    const result = await getRecords(filters);
    const records = result.records;
    recordsByView.set("history", records);
    status.textContent = result.truncated ? `Exibindo até ${records.length} registros. Refine os filtros para limitar o período.` : `${records.length} lançamento(s).`;
    if (!records.length) {
      list.append(emptyState("Nenhum lançamento encontrado para os filtros selecionados."));
      return;
    }
    for (const record of records) list.append(renderRecord(record));
  } catch (cause) {
    status.textContent = cause.message;
    status.className = "feedback feedback--error";
  }
}

function renderRecord(record) {
  const article = document.createElement("article");
  article.className = "record-card";
  const top = document.createElement("div");
  top.className = "record-card__top";
  const date = document.createElement("span");
  date.textContent = formatDate(record.date);
  const quantity = document.createElement("span");
  quantity.className = "record-card__quantity";
  quantity.textContent = `${record.quantity} ${Number(record.quantity) === 1 ? "bobina" : "bobinas"}`;
  top.append(date, quantity);
  const details = document.createElement("div");
  details.className = "record-card__details";
  const weightOrLegacySize = record.weight ? `Peso ${record.weight} kg` : `Tamanho ${record.legacySize}`;
  for (const text of [`RE ${record.re}`, record.material, weightOrLegacySize, record.difficulty]) {
    const tag = document.createElement("span");
    tag.className = "record-card__tag";
    tag.textContent = text;
    details.append(tag);
  }
  article.append(top, details);
  return article;
}

function emptyState(message) {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

async function loadDashboard(filters = getFilterValues($("#dashboard-filters"))) {
  const status = $("#dashboard-status");
  const content = $("#dashboard-content");
  const error = validateFilters(filters);
  if (error) { status.textContent = error; status.className = "feedback feedback--error"; return; }
  status.className = "muted";
  status.textContent = "Carregando indicadores…";
  content.replaceChildren();
  try {
    const result = await getRecords(filters);
    const records = result.records;
    recordsByView.set("dashboard", records);
    const notes = [];
    if (result.truncated) notes.push("Indicadores baseados nos primeiros 5.000 lançamentos retornados. Refine o período para incluir somente os dados necessários.");
    if (records.some(record => !record.weight)) notes.push("Registros antigos sem peso são excluídos dos totais em kg.");
    status.textContent = notes.join(" ");
    if (!records.length) {
      content.append(emptyState("Não há dados registrados para o período selecionado."));
      return;
    }
    content.append(renderDashboard(records));
  } catch (cause) {
    status.textContent = cause.message;
    status.className = "feedback feedback--error";
  }
}

function renderDashboard(records) {
  const container = document.createElement("div");
  const today = records.filter(record => record.date === todayISO());
  const metrics = document.createElement("div");
  metrics.className = "metric-grid";
  metrics.append(
    metric("Peso conhecido no período", `${formatNumber(sumWeight(records))} kg`),
    metric("Peso conhecido hoje", `${formatNumber(sumWeight(today))} kg`)
  );
  const charts = document.createElement("div");
  charts.className = "chart-grid";
  charts.append(
    chart("Por material", aggregate(records, "material", ["Com RU", "Sem RU"])),
    chart("Peso por bobina (kg)", aggregateWeight(records), "kg"),
    chart("Por dificuldade", aggregate(records, "difficulty", ["Fácil", "Média", "Difícil"])),
    chart("Bobinas por RE", aggregate(records, "re").sort((a, b) => b.value - a.value)),
    chart("Evolução diária (kg)", aggregateWeightBy(records, "date").sort((a, b) => a.label.localeCompare(b.label)), "kg")
  );
  container.append(metrics, charts);
  return container;
}

function metric(label, value) {
  const card = document.createElement("section");
  card.className = "metric-card";
  const name = document.createElement("p");
  name.className = "metric-card__label";
  name.textContent = label;
  const number = document.createElement("p");
  number.className = "metric-card__value";
  number.textContent = String(value);
  card.append(name, number);
  return card;
}

function aggregate(records, key, order = null) {
  const totals = new Map();
  for (const record of records) {
    const label = record[key] || "Não informado";
    totals.set(label, (totals.get(label) || 0) + Number(record.quantity));
  }
  const labels = order || [...totals.keys()].sort();
  return labels.map(label => ({ label, value: totals.get(label) || 0 }));
}

function aggregateWeight(records) {
  const totals = new Map();
  for (const record of records) {
    if (!record.weight) continue;
    const label = String(record.weight);
    totals.set(label, (totals.get(label) || 0) + Number(record.weight) * Number(record.quantity));
  }
  return [...totals.entries()]
    .map(([label, value]) => ({ label: `${label} kg`, value }))
    .sort((a, b) => Number.parseInt(a.label, 10) - Number.parseInt(b.label, 10));
}

function aggregateWeightBy(records, key) {
  const totals = new Map();
  for (const record of records) {
    if (!record.weight) continue;
    const label = record[key] || "Não informado";
    totals.set(label, (totals.get(label) || 0) + Number(record.weight) * Number(record.quantity));
  }
  return [...totals.entries()].map(([label, value]) => ({ label, value }));
}

function chart(title, data, unit = "bobinas") {
  const section = document.createElement("section");
  section.className = "chart-card";
  const heading = document.createElement("h2");
  heading.textContent = title;
  const list = document.createElement("div");
  list.className = "bar-list";
  const max = Math.max(1, ...data.map(item => item.value));
  for (const item of data) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const label = document.createElement("span");
    label.textContent = title.startsWith("Evolução diária") ? formatDate(item.label) : item.label;
    const track = document.createElement("span");
    track.className = "bar-track";
    track.setAttribute("aria-label", `${item.value} ${unit}`);
    const fill = document.createElement("span");
    fill.className = "bar-fill";
    fill.style.width = `${(item.value / max) * 100}%`;
    track.append(fill);
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = formatNumber(item.value);
    row.append(label, track, value);
    list.append(row);
  }
  section.append(heading, list);
  return section;
}

function showFormErrors(errors) {
  for (const field of ["re", "material", "weight", "difficulty"]) {
    const error = $(`#${field}-error`);
    error.textContent = errors[field] || "";
    const control = field === "re" ? $("#employee-re") : $(`[name="${field}"]`);
    if (control && (field === "re" || field === "weight")) {
      if (errors[field]) control.setAttribute("aria-invalid", "true");
      else control.removeAttribute("aria-invalid");
    }
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = {
    re: $("#employee-re").value.trim(),
    material: new FormData(form).get("material") || "",
    weight: $("#weight").value.trim(),
    difficulty: new FormData(form).get("difficulty") || ""
  };
  const errors = validateProduction(values);
  showFormErrors(errors);
  const feedback = $("#form-feedback");
  feedback.hidden = true;
  if (Object.keys(errors).length) {
    const firstError = Object.keys(errors)[0];
    const selector = firstError === "re" ? "#employee-re" : `[name="${firstError}"]`;
    $(selector).focus();
    return;
  }
  const button = $("#save-button");
  $("#another-record").hidden = true;
  button.disabled = true;
  button.textContent = "Salvando…";
  const fingerprint = JSON.stringify(values);
  if (!pendingRequestId || pendingRequestFingerprint !== fingerprint) {
    pendingRequestId = crypto.randomUUID();
    pendingRequestFingerprint = fingerprint;
  }
  const requestId = pendingRequestId;
  try {
    const result = await saveRecord({ ...values, weight: Number(values.weight) }, requestId);
    feedback.textContent = `Produção registrada com sucesso para ${formatDate(result.record.date)}.`;
    feedback.className = "feedback feedback--success";
    feedback.hidden = false;
    form.reset();
    showFormErrors({});
    pendingRequestId = null;
    pendingRequestFingerprint = null;
    await refreshHome();
    const another = $("#another-record");
    another.hidden = false;
  } catch (cause) {
    feedback.textContent = `${cause.message} Seus dados foram mantidos. Use “Salvar produção” para tentar novamente; a solicitação repetida mantém o mesmo identificador para reduzir duplicidade.`;
    feedback.className = "feedback feedback--error";
    feedback.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = "Salvar produção";
  }
}

function setUp() {
  const logo = $(".brand__logo");
  logo.addEventListener("load", () => { logo.hidden = false; });
  logo.addEventListener("error", () => { logo.hidden = true; });
  $("#today-label").textContent = toDateLabel();
  $$("[data-view]").forEach(button => button.addEventListener("click", () => navigate(button.dataset.view)));
  window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
  $("#production-form").addEventListener("submit", handleSubmit);
  $("#another-record").addEventListener("click", () => {
    $("#another-record").hidden = true;
    $("#form-feedback").hidden = true;
    $("#employee-re").focus();
  });
  for (const name of ["re", "weight"]) {
    $(`[name="${name}"]`).addEventListener("input", () => {
      const error = $(`#${name}-error`);
      if (error.textContent) error.textContent = "";
    });
  }
  $("#history-filters").addEventListener("submit", event => { event.preventDefault(); loadHistory(); });
  $("#dashboard-filters").addEventListener("submit", event => { event.preventDefault(); loadDashboard(); });
  $("#clear-filters").addEventListener("click", () => { $("#history-filters").reset(); loadHistory(); });
  $("#clear-dashboard-filters").addEventListener("click", () => { $("#dashboard-filters").reset(); loadDashboard(); });
  checkHealth().then(() => setConnection(true, "API conectada")).catch(() => setConnection(false, "API indisponível"));
  refreshHome();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => setConnection(false, "Falha ao preparar uso offline"));
  navigate(views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "inicio");
}

setUp();
