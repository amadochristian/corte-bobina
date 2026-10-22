async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { ...options, headers: { Accept: "application/json", ...options.headers } });
  } catch {
    throw new Error("Não foi possível conectar à API. Verifique a conexão e tente novamente.");
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("A API retornou uma resposta inválida. Tente novamente mais tarde.");
  }
  if (!response.ok || payload.ok !== true) {
    throw new Error(payload.error || "A operação não foi concluída. Tente novamente.");
  }
  return payload;
}

export function checkHealth() {
  return request("/api/health");
}

export function getRecords(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  const suffix = params.size ? `?${params}` : "";
  return request(`/api/records${suffix}`);
}

export function saveRecord(record, requestId) {
  return request("/api/records", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...record, requestId })
  });
}
