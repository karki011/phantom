// Author: Subash Karki

function unwrapNull(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === 'object' && v !== null && 'Valid' in v) {
    const rec = v as Record<string, unknown>;
    if (!rec.Valid) return null;
    if ('String' in rec) return rec.String;
    if ('Int64' in rec) return rec.Int64;
    if ('Float64' in rec) return rec.Float64;
    return null;
  }
  return v;
}

export function normalize<T>(obj: unknown): T {
  if (obj === null || obj === undefined) return obj as T;
  if (Array.isArray(obj)) return obj.map((item) => normalize(item)) as T;
  if (typeof obj === 'object') {
    const raw = obj as Record<string, unknown>;
    if ('Valid' in raw) return unwrapNull(raw) as T;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      out[k] = typeof v === 'object' && v !== null ? normalize(v) : v;
    }
    return out as T;
  }
  return obj as T;
}
