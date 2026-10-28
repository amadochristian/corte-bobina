const { callAppsScript, json, methodNotAllowed, validateFilters, MAX_LIMIT } = require("../lib/apps-script");

function validateBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "Corpo da requisição inválido.";
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > 4096) return "A requisição excede o tamanho permitido.";
  if (typeof body.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.requestId)) return "Identificador da solicitação inválido.";
  if (typeof body.re !== "string" || !/^\d{1,30}$/.test(body.re)) return "RE inválido.";
  if (!["Com RU", "Sem RU"].includes(body.material)) return "Material inválido.";
  if (!Number.isSafeInteger(body.weight) || body.weight < 1) return "O peso deve ser um inteiro positivo em kg.";
  if (!["Fácil", "Média", "Difícil"].includes(body.difficulty)) return "Dificuldade inválida.";
  return "";
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    const validation = validateFilters(req.query || {});
    if (validation.error) return json(res, 400, { ok: false, error: validation.error });
    try {
      const result = await callAppsScript({ action: "list", filters: validation.filters, limit: MAX_LIMIT });
      if (!Array.isArray(result.records) || typeof result.truncated !== "boolean") throw new Error("Invalid Apps Script records response");
      return json(res, 200, { ok: true, records: result.records, truncated: result.truncated });
    } catch (error) {
      return json(res, error.statusCode || 502, { ok: false, error: error.statusCode === 503 ? error.message : "Não foi possível carregar os lançamentos." });
    }
  }
  if (req.method !== "POST") return methodNotAllowed(res, ["GET", "POST"]);
  const invalid = validateBody(req.body);
  if (invalid) return json(res, 400, { ok: false, error: invalid });
  const { re, material, weight, difficulty, requestId } = req.body;
  try {
    const result = await callAppsScript({ action: "create", requestId, record: { re, material, weight, difficulty } });
    if (!result.record || typeof result.record.date !== "string") throw new Error("Invalid Apps Script create response");
    return json(res, 201, { ok: true, record: result.record, duplicate: result.duplicate === true });
  } catch (error) {
    return json(res, error.statusCode || 502, { ok: false, error: error.statusCode === 503 ? error.message : "Não foi possível confirmar a gravação. Não envie um novo lançamento; tente novamente com os mesmos dados." });
  }
};
