const ALLOWED = {
  material: ["Com RU", "Sem RU"],
  size: ["Pequena", "Média", "Grande"],
  difficulty: ["Fácil", "Média", "Difícil"]
};
const MAX_LIMIT = 5000;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8").send(JSON.stringify(body));
}

function methodNotAllowed(res, allowed) {
  res.setHeader("Allow", allowed.join(", "));
  json(res, 405, { ok: false, error: "Método não permitido." });
}

function validDate(value) {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateFilters(query) {
  const filters = {};
  for (const key of ["from", "to", "re", "material", "size", "difficulty"]) {
    const value = query[key];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string") return { error: `Parâmetro inválido: ${key}.` };
    if (key === "from" || key === "to") {
      if (!validDate(value)) return { error: `Data inválida: ${key}.` };
    } else if (key === "re") {
      if (!/^\d{1,30}$/.test(value)) return { error: "O RE deve conter somente números." };
    } else if (!ALLOWED[key].includes(value)) return { error: `Valor inválido para ${key}.` };
    filters[key] = value;
  }
  if (filters.from && filters.to && filters.from > filters.to) return { error: "A data inicial é posterior à data final." };
  return { filters };
}

async function callAppsScript(payload) {
  const url = process.env.APPS_SCRIPT_URL;
  const token = process.env.INTEGRATION_TOKEN;
  if (!url || !token) throw Object.assign(new Error("A integração com a planilha não está configurada."), { statusCode: 503 });
  let endpoint;
  try { endpoint = new URL(url); } catch { throw Object.assign(new Error("A configuração da integração está inválida."), { statusCode: 503 }); }
  if (endpoint.protocol !== "https:") throw Object.assign(new Error("A configuração da integração deve usar HTTPS."), { statusCode: 503 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, token }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error("Falha de comunicação com o adaptador da planilha.");
    const result = await response.json();
    if (!result || result.ok !== true) throw new Error("O adaptador não confirmou a operação.");
    return result;
  } catch (error) {
    if (error.statusCode) throw error;
    throw Object.assign(new Error(error.name === "AbortError" ? "Tempo esgotado ao consultar a planilha." : "Não foi possível confirmar a resposta da planilha."), { statusCode: 502 });
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { callAppsScript, json, methodNotAllowed, validateFilters, MAX_LIMIT };
