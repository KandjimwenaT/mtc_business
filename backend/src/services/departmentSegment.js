// Canonical business segments used for Key Accounts vs EBU scoping.
// Legacy / free-text values (e.g. "Key Accounts Department") are normalized
// before any equality check.

const KEY_ACCOUNTS = "Key Accounts";
const EBU = "EBU";

function normalizeDepartmentSegment(department) {
  if (department == null) return null;
  const raw = String(department).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower === "ebu") return EBU;
  if (lower === "key accounts" || lower.startsWith("key accounts")) {
    return KEY_ACCOUNTS;
  }

  return null;
}

function isKeyAccountsDepartment(department) {
  return normalizeDepartmentSegment(department) === KEY_ACCOUNTS;
}

function isEbuDepartment(department) {
  return normalizeDepartmentSegment(department) === EBU;
}

function departmentsMatch(a, b) {
  const left = normalizeDepartmentSegment(a);
  const right = normalizeDepartmentSegment(b);
  if (!left || !right) return false;
  return left === right;
}

module.exports = {
  KEY_ACCOUNTS,
  EBU,
  normalizeDepartmentSegment,
  isKeyAccountsDepartment,
  isEbuDepartment,
  departmentsMatch,
};
