const MATERIALS = ["Com RU", "Sem RU"];
const DIFFICULTIES = ["Fácil", "Média", "Difícil"];

export function validateProduction(values) {
  const errors = {};
  if (!/^\d{1,30}$/.test(values.re)) errors.re = "Informe o RE usando somente números.";
  if (!MATERIALS.includes(values.material)) errors.material = "Selecione o material.";
  if (!/^[1-9]\d*$/.test(values.weight) || !Number.isSafeInteger(Number(values.weight))) {
    errors.weight = "Informe o peso inteiro da bobina em kg.";
  }
  if (!DIFFICULTIES.includes(values.difficulty)) errors.difficulty = "Selecione a dificuldade observada no corte.";
  return errors;
}

export function validateFilters(values) {
  if (values.from && !isValidDate(values.from)) return "A data inicial é inválida.";
  if (values.to && !isValidDate(values.to)) return "A data final é inválida.";
  if (values.from && values.to && values.from > values.to) return "A data inicial não pode ser posterior à data final.";
  if (values.re && !/^\d{1,30}$/.test(values.re)) return "O RE deve conter somente números.";
  if (values.weight && (!/^[1-9]\d*$/.test(values.weight) || !Number.isSafeInteger(Number(values.weight)))) return "O peso deve ser um inteiro positivo em kg.";
  return "";
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}
