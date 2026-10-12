/**
 * AutoQP — Postgres <-> TypeScript boundary case converters.
 *
 * Postgres schema uses snake_case column names (e.g., `subject_id`, `created_at`).
 * Application layer TypeScript uses camelCase (e.g., `subjectId`, `createdAt`).
 *
 * Per AGENTS.md:
 * "Keys INSIDE jsonb payloads are camelCase, exactly as packages/schema defines them.
 * Only top-level column names are snake_case; jsonb contents are never key-converted."
 */

/**
 * Converts a snake_case string to camelCase.
 */
export function snakeToCamel(str: string): string {
  return str.replace(/([-_][a-z0-9])/gi, ($1) =>
    $1.toUpperCase().replace("-", "").replace("_", "")
  );
}

/**
 * Converts a camelCase string to snake_case.
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Transforms top-level object keys from snake_case to camelCase.
 * Nested structures (such as jsonb payloads like `typeData`) are preserved as-is.
 */
export function toCamelCase<T = Record<string, unknown>>(
  obj: Record<string, unknown> | null | undefined
): T | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return (obj as unknown as T) ?? null;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[snakeToCamel(key)] = value;
  }

  return result as T;
}

/**
 * Transforms top-level object keys from camelCase to snake_case.
 * Nested structures (such as jsonb payloads) are preserved as-is.
 */
export function toSnakeCase<T = Record<string, unknown>>(
  obj: Record<string, unknown> | null | undefined
): T | null {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return (obj as unknown as T) ?? null;
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = value;
  }

  return result as T;
}

/**
 * Transforms an array of rows from snake_case to camelCase.
 */
export function toCamelCaseRows<T = Record<string, unknown>>(
  rows: Record<string, unknown>[] | null | undefined
): T[] {
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map((r) => toCamelCase<T>(r) as T);
}
