const TIME_ZONE = "America/Sao_Paulo";
const HEADERS = ["Data", "RE do colaborador", "Material", "Tamanho", "Dificuldade", "Quantidade"];
const OPTIONS = {
  material: ["Com RU", "Sem RU"],
  size: ["Pequena", "Média", "Grande"],
  difficulty: ["Fácil", "Média", "Difícil"]
};
const MAX_RECORDS = 5000;

function doPost(event) {
  try {
    if (!event || !event.postData || typeof event.postData.contents !== "string") {
      return output({
        ok: false,
        error: "doPost recebe chamadas HTTP. Execute verifyConfiguration no editor para testar a configuração."
      });
    }
    const request = JSON.parse(event.postData.contents || "{}");
    const properties = PropertiesService.getScriptProperties();
    const token = properties.getProperty("INTEGRATION_TOKEN");
    if (!token || !safeEqual(String(request.token || ""), token)) return output({ ok: false, error: "Não autorizado." });
    const sheet = getSheet();
    if (request.action === "health") return output({ ok: true });
    if (request.action === "list") return output(listRecords(sheet, request.filters || {}, request.limit));
    if (request.action === "create") return output(createRecord(sheet, request));
    return output({ ok: false, error: "Operação inválida." });
  } catch (error) {
    console.error("Request failed: " + String(error && error.message || "unknown"));
    return output({ ok: false, error: "Não foi possível concluir a operação." });
  }
}

function verifyConfiguration() {
  const token = PropertiesService.getScriptProperties().getProperty("INTEGRATION_TOKEN");
  if (!token) throw new Error("Configure INTEGRATION_TOKEN nas propriedades do script.");
  const sheet = getSheet();
  Logger.log("Configuração válida. Aba verificada: " + sheet.getName());
  return true;
}

function output(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function getSheet() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("SPREADSHEET_ID");
  const sheetName = properties.getProperty("SHEET_NAME");
  if (!spreadsheetId || !sheetName) throw new Error("Script properties are not configured");
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error("Configured sheet was not found");
  const headers = sheet.getRange(1, 1, 1, HEADERS.length).getDisplayValues()[0];
  if (HEADERS.some(function(header, index) { return headers[index] !== header; })) throw new Error("Unexpected sheet headers");
  return sheet;
}

function listRecords(sheet, filters, requestedLimit) {
  if (!filters || typeof filters !== "object" || Array.isArray(filters)) throw new Error("Invalid filters");
  ["from", "to"].forEach(function(key) {
    if (filters[key] && !isIsoDate(filters[key])) throw new Error("Invalid date filter");
  });
  if (filters.from && filters.to && filters.from > filters.to) throw new Error("Invalid date range");
  if (filters.re && !/^\d{1,30}$/.test(filters.re)) throw new Error("Invalid RE filter");
  if (filters.material && !OPTIONS.material.includes(filters.material)) throw new Error("Invalid material filter");
  if (filters.size && !OPTIONS.size.includes(filters.size)) throw new Error("Invalid size filter");
  if (filters.difficulty && !OPTIONS.difficulty.includes(filters.difficulty)) throw new Error("Invalid difficulty filter");
  const limit = Math.min(MAX_RECORDS, Math.max(1, Number(requestedLimit) || MAX_RECORDS));
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, records: [], truncated: false };
  const values = sheet.getRange(2, 1, lastRow - 1, HEADERS.length).getValues();
  const matching = [];
  for (let index = 0; index < values.length; index++) {
    const record = rowToRecord(values[index]);
    if (!record) continue;
    if (filters.from && record.date < filters.from) continue;
    if (filters.to && record.date > filters.to) continue;
    if (filters.re && record.re !== filters.re) continue;
    if (filters.material && record.material !== filters.material) continue;
    if (filters.size && record.size !== filters.size) continue;
    if (filters.difficulty && record.difficulty !== filters.difficulty) continue;
    matching.push({ record: record, row: index + 2 });
  }
  matching.sort(function(left, right) { return right.record.date.localeCompare(left.record.date) || right.row - left.row; });
  return { ok: true, records: matching.slice(0, limit).map(function(item) { return item.record; }), truncated: matching.length > limit };
}

function rowToRecord(row) {
  if (row.every(function(value) { return value === "" || value === null; })) return null;
  const date = normalizeDate(row[0]);
  const re = String(row[1]);
  const material = String(row[2]);
  const size = String(row[3]);
  const difficulty = String(row[4]);
  const quantity = Number(row[5]);
  if (!date || !/^\d{1,30}$/.test(re) || !OPTIONS.material.includes(material) ||
      !OPTIONS.size.includes(size) || !OPTIONS.difficulty.includes(difficulty) ||
      !Number.isSafeInteger(quantity) || quantity < 1) return null;
  return { date: date, re: re, material: material, size: size, difficulty: difficulty, quantity: quantity };
}

function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return Utilities.formatDate(value, TIME_ZONE, "yyyy-MM-dd");
  value = String(value || "");
  if (isIsoDate(value)) return value;
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const normalized = match[3] + "-" + String(match[2]).padStart(2, "0") + "-" + String(match[1]).padStart(2, "0");
  return isIsoDate(normalized) ? normalized : "";
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function createRecord(sheet, request) {
  const input = request.record || {};
  if (typeof request.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(request.requestId)) throw new Error("Invalid request id");
  if (typeof input.re !== "string" || !/^\d{1,30}$/.test(input.re)) throw new Error("Invalid RE");
  if (!OPTIONS.material.includes(input.material) || !OPTIONS.size.includes(input.size) || !OPTIONS.difficulty.includes(input.difficulty)) throw new Error("Invalid classification");
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1) throw new Error("Invalid quantity");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const cacheKey = "record:" + request.requestId;
    const cached = cache.get(cacheKey);
    const fingerprint = JSON.stringify({
      re: input.re, material: input.material, size: input.size,
      difficulty: input.difficulty, quantity: input.quantity
    });
    if (cached) {
      const prior = JSON.parse(cached);
      if (prior.fingerprint !== fingerprint) throw new Error("Request id already used with different data");
      return prior.response;
    }
    const record = {
      date: Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd"),
      re: input.re,
      material: input.material,
      size: input.size,
      difficulty: input.difficulty,
      quantity: input.quantity
    };
    const row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, HEADERS.length).setNumberFormats([["@", "@", "@", "@", "@", "0"]]);
    sheet.getRange(row, 1, 1, HEADERS.length).setValues([[
      record.date, record.re, record.material, record.size, record.difficulty, record.quantity
    ]]);
    const result = { ok: true, record: record, duplicate: false };
    cache.put(cacheKey, JSON.stringify({
      fingerprint: fingerprint,
      response: { ok: true, record: record, duplicate: true }
    }), 21600);
    return result;
  } finally {
    lock.releaseLock();
  }
}
