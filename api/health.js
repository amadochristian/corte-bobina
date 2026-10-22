const { callAppsScript, json, methodNotAllowed } = require("../lib/apps-script");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return methodNotAllowed(res, ["GET"]);
  try {
    await callAppsScript({ action: "health" });
    return json(res, 200, { ok: true, status: "connected" });
  } catch (error) {
    return json(res, error.statusCode || 502, { ok: false, error: error.statusCode === 503 ? error.message : "Não foi possível verificar a conexão com a planilha." });
  }
};
