// Canonical business segments used for Key Accounts vs EBU scoping.
// Legacy / free-text values (e.g. "Key Accounts Department") are normalized
// before any equality check.

export type DepartmentSegment = "Key Accounts" | "EBU";

export function normalizeDepartmentSegment(
  department: string | null | undefined
): DepartmentSegment | null {
  if (department == null) return null;
  const raw = String(department).trim();
  if (!raw) return null;

  const lower = raw.toLowerCase();
  if (lower === "ebu") return "EBU";
  if (lower === "key accounts" || lower.startsWith("key accounts")) {
    return "Key Accounts";
  }

  return null;
}

export function departmentsMatch(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = normalizeDepartmentSegment(a);
  const right = normalizeDepartmentSegment(b);
  if (!left || !right) return false;
  return left === right;
}
