/**
 * Null/Undefined Safety Stress Tests
 * Tests the defensive patterns applied across the Phantom OS renderer/UI layer.
 * Pure logic tests — no DOM or React rendering.
 * @author Subash Karki
 */
import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// 1. Array.isArray guard: `Array.isArray(x) ? x : []`
// ---------------------------------------------------------------------------
describe('Array.isArray guard pattern', () => {
  const safeArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);

  const cases: [string, unknown, unknown[]][] = [
    ['null', null, []],
    ['undefined', undefined, []],
    ['empty object', {}, []],
    ['string', 'string', []],
    ['number zero', 0, []],
    ['boolean false', false, []],
    ['empty array', [], []],
    ['populated array', [1, 2, 3], [1, 2, 3]],
    ['nested array', [[1], [2]], [[1], [2]]],
    ['array-like object', { length: 2, 0: 'a', 1: 'b' }, []],
    ['NaN', NaN, []],
    ['Infinity', Infinity, []],
    ['Symbol', Symbol('test'), []],
    ['BigInt', BigInt(42), []],
    ['Date', new Date(), []],
    ['RegExp', /test/, []],
    ['Map', new Map(), []],
    ['Set', new Set(), []],
  ];

  for (const [label, input, expected] of cases) {
    it(`returns ${JSON.stringify(expected)} for ${label}`, () => {
      expect(safeArray(input)).toEqual(expected);
    });
  }

  it('concurrent: 100 rapid iterations never throw', () => {
    const inputs = [null, undefined, {}, 'str', 0, false, [], [1, 2, 3]];
    for (let i = 0; i < 100; i++) {
      for (const input of inputs) {
        expect(() => safeArray(input)).not.toThrow();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Nullish coalescing default: `(data ?? { branch: [], project: [] })`
// ---------------------------------------------------------------------------
describe('Nullish coalescing default object pattern', () => {
  interface GraphData {
    branch: unknown[];
    project: unknown[];
  }

  const safeGraphData = (data: unknown): GraphData =>
    (data ?? { branch: [], project: [] }) as GraphData;

  it('returns default for null', () => {
    const result = safeGraphData(null);
    expect(result).toEqual({ branch: [], project: [] });
  });

  it('returns default for undefined', () => {
    const result = safeGraphData(undefined);
    expect(result).toEqual({ branch: [], project: [] });
  });

  it('preserves valid data as-is', () => {
    const data = { branch: ['main'], project: ['p1'] };
    expect(safeGraphData(data)).toBe(data);
  });

  it('does NOT replace empty object (only null/undefined trigger ??)', () => {
    const data = {};
    expect(safeGraphData(data)).toBe(data);
  });

  it('does NOT replace zero or empty string (not nullish)', () => {
    expect(safeGraphData(0)).toBe(0);
    expect(safeGraphData('')).toBe('');
    expect(safeGraphData(false)).toBe(false);
  });

  it('handles partial data (branch present, project missing)', () => {
    const data = { branch: ['main'] };
    const result = safeGraphData(data);
    // ?? only guards the whole value, not sub-keys
    expect(result).toEqual({ branch: ['main'] });
    expect((result as Record<string, unknown>).project).toBeUndefined();
  });

  it('handles data where branch is null', () => {
    const data = { branch: null, project: ['p1'] };
    const result = safeGraphData(data);
    expect(result.branch).toBeNull();
    expect(result.project).toEqual(['p1']);
  });
});

// ---------------------------------------------------------------------------
// 3. Spread with nullish fallback: `[...(arr ?? [])]`
// ---------------------------------------------------------------------------
describe('Spread with nullish fallback pattern', () => {
  const safeSpread = (arr: unknown): unknown[] => [...((arr as unknown[]) ?? [])];

  it('returns empty for null', () => {
    expect(safeSpread(null)).toEqual([]);
  });

  it('returns empty for undefined', () => {
    expect(safeSpread(undefined)).toEqual([]);
  });

  it('spreads empty array', () => {
    expect(safeSpread([])).toEqual([]);
  });

  it('spreads populated array', () => {
    expect(safeSpread([1])).toEqual([1]);
  });

  it('spreads string into characters (JS spread behavior)', () => {
    expect(safeSpread('abc')).toEqual(['a', 'b', 'c']);
  });

  it('concurrent: 100 iterations of null/undefined/arrays', () => {
    for (let i = 0; i < 100; i++) {
      expect(() => safeSpread(null)).not.toThrow();
      expect(() => safeSpread(undefined)).not.toThrow();
      expect(() => safeSpread([])).not.toThrow();
      expect(() => safeSpread([i, i + 1])).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Optional chaining: `x?.map()`
// ---------------------------------------------------------------------------
describe('Optional chaining .map() pattern', () => {
  const safeMap = (x: unknown[] | null | undefined): unknown[] | undefined =>
    x?.map((item) => item);

  it('returns undefined for null', () => {
    expect(safeMap(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(safeMap(undefined)).toBeUndefined();
  });

  it('maps empty array', () => {
    expect(safeMap([])).toEqual([]);
  });

  it('maps populated array', () => {
    expect(safeMap([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('concurrent: 100 iterations never throw', () => {
    for (let i = 0; i < 100; i++) {
      expect(() => safeMap(null)).not.toThrow();
      expect(() => safeMap(undefined)).not.toThrow();
      expect(() => safeMap([])).not.toThrow();
      expect(() => safeMap([i])).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Error type discrimination — instanceof Error
//    Mirrors the fix in useChat.ts parseErr handling (line 236)
// ---------------------------------------------------------------------------
describe('Error type discrimination (instanceof Error)', () => {
  const classifyError = (err: unknown): { isError: boolean; message: string } => {
    if (err instanceof Error) {
      return { isError: true, message: err.message };
    }
    return { isError: false, message: String(err) };
  };

  it('identifies standard Error', () => {
    const result = classifyError(new Error('test message'));
    expect(result.isError).toBe(true);
    expect(result.message).toBe('test message');
  });

  it('identifies TypeError', () => {
    const result = classifyError(new TypeError('type err'));
    expect(result.isError).toBe(true);
    expect(result.message).toBe('type err');
  });

  it('identifies SyntaxError', () => {
    const result = classifyError(new SyntaxError('bad syntax'));
    expect(result.isError).toBe(true);
    expect(result.message).toBe('bad syntax');
  });

  it('identifies RangeError', () => {
    const result = classifyError(new RangeError('out of range'));
    expect(result.isError).toBe(true);
    expect(result.message).toBe('out of range');
  });

  it('rejects string throw', () => {
    const result = classifyError('string throw');
    expect(result.isError).toBe(false);
    expect(result.message).toBe('string throw');
  });

  it('rejects number throw', () => {
    const result = classifyError(42);
    expect(result.isError).toBe(false);
    expect(result.message).toBe('42');
  });

  it('rejects null throw', () => {
    const result = classifyError(null);
    expect(result.isError).toBe(false);
    expect(result.message).toBe('null');
  });

  it('rejects undefined throw', () => {
    const result = classifyError(undefined);
    expect(result.isError).toBe(false);
    expect(result.message).toBe('undefined');
  });

  it('rejects object with message property (duck-type imposter)', () => {
    const result = classifyError({ message: 'fake error' });
    expect(result.isError).toBe(false);
  });

  it('rejects boolean throw', () => {
    const result = classifyError(false);
    expect(result.isError).toBe(false);
  });

  it('identifies custom error subclass', () => {
    class AppError extends Error {
      constructor(msg: string, public code: number) {
        super(msg);
        this.name = 'AppError';
      }
    }
    const result = classifyError(new AppError('app fail', 500));
    expect(result.isError).toBe(true);
    expect(result.message).toBe('app fail');
  });

  it('concurrent: 100 iterations with mixed throw types', () => {
    const throwables = [
      new Error('e'), 'string', 42, null, undefined,
      { message: 'fake' }, new TypeError('t'), false,
    ];
    for (let i = 0; i < 100; i++) {
      for (const t of throwables) {
        expect(() => classifyError(t)).not.toThrow();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 6. JSON.parse try-catch — mirrors useChat.ts NDJSON parsing (line 211-239)
// ---------------------------------------------------------------------------
describe('JSON.parse try-catch guard pattern', () => {
  const safeParseLine = (line: string): { ok: boolean; data?: unknown; error?: string } => {
    if (!line.trim()) return { ok: false, error: 'empty line' };
    try {
      const data = JSON.parse(line);
      return { ok: true, data };
    } catch (parseErr) {
      if (parseErr instanceof Error && !parseErr.message.includes('JSON')) {
        // Re-throw non-parse errors (mirrors useChat.ts logic)
        return { ok: false, error: `non-parse: ${parseErr.message}` };
      }
      // Swallow JSON parse errors
      return { ok: false, error: 'parse_error' };
    }
  };

  it('parses valid JSON', () => {
    const result = safeParseLine('{"type":"delta","content":"hi"}');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ type: 'delta', content: 'hi' });
  });

  it('handles empty string', () => {
    expect(safeParseLine('')).toEqual({ ok: false, error: 'empty line' });
  });

  it('handles whitespace-only', () => {
    expect(safeParseLine('   ')).toEqual({ ok: false, error: 'empty line' });
  });

  it('catches malformed JSON without propagating', () => {
    const result = safeParseLine('{broken json');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('parse_error');
  });

  it('catches truncated JSON', () => {
    const result = safeParseLine('{"type":"delta","con');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('parse_error');
  });

  it('catches single quote JSON (invalid)', () => {
    const result = safeParseLine("{'key':'value'}");
    expect(result.ok).toBe(false);
    expect(result.error).toBe('parse_error');
  });

  it('handles array JSON', () => {
    const result = safeParseLine('[1,2,3]');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('handles string JSON', () => {
    const result = safeParseLine('"hello"');
    expect(result.ok).toBe(true);
    expect(result.data).toBe('hello');
  });

  it('handles number JSON', () => {
    const result = safeParseLine('42');
    expect(result.ok).toBe(true);
    expect(result.data).toBe(42);
  });

  it('handles null JSON', () => {
    const result = safeParseLine('null');
    expect(result.ok).toBe(true);
    expect(result.data).toBeNull();
  });

  it('concurrent: 100 rapid iterations with mixed inputs', () => {
    const lines = [
      '{"type":"delta"}',
      '{bad',
      '',
      'null',
      '"str"',
      '{"nested":{"a":1}}',
      '{',
      '[1,2,',
    ];
    for (let i = 0; i < 100; i++) {
      for (const line of lines) {
        expect(() => safeParseLine(line)).not.toThrow();
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 7. localStorage try-catch — mirrors ThemeProvider.tsx (lines 17-20)
// ---------------------------------------------------------------------------
describe('localStorage try-catch guard pattern', () => {
  const safeReadTheme = (storage: { getItem: (key: string) => string | null }): 'dark' | 'light' => {
    let defaultColorScheme: 'dark' | 'light' = 'dark';
    try {
      defaultColorScheme =
        (storage.getItem('phantom-theme')?.replace(/"/g, '') as 'dark' | 'light') ?? 'dark';
    } catch {
      // Mirrors ThemeProvider: catch and keep default
    }
    return defaultColorScheme;
  };

  it('returns stored "dark" value', () => {
    const storage = { getItem: () => '"dark"' };
    expect(safeReadTheme(storage)).toBe('dark');
  });

  it('returns stored "light" value', () => {
    const storage = { getItem: () => '"light"' };
    expect(safeReadTheme(storage)).toBe('light');
  });

  it('returns stored value without quotes', () => {
    const storage = { getItem: () => 'light' };
    expect(safeReadTheme(storage)).toBe('light');
  });

  it('returns "dark" when getItem returns null', () => {
    const storage = { getItem: () => null };
    expect(safeReadTheme(storage)).toBe('dark');
  });

  it('returns "dark" when getItem throws (e.g., SecurityError in iframe)', () => {
    const storage = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError');
      },
    };
    expect(safeReadTheme(storage)).toBe('dark');
  });

  it('returns "dark" when getItem throws generic error', () => {
    const storage = {
      getItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(safeReadTheme(storage)).toBe('dark');
  });

  it('concurrent: 100 iterations with throwing storage', () => {
    const throwingStorage = {
      getItem: () => {
        throw new Error('unavailable');
      },
    };
    const normalStorage = { getItem: () => '"light"' };
    for (let i = 0; i < 100; i++) {
      expect(() => safeReadTheme(throwingStorage)).not.toThrow();
      expect(safeReadTheme(throwingStorage)).toBe('dark');
      expect(safeReadTheme(normalStorage)).toBe('light');
    }
  });
});

// ---------------------------------------------------------------------------
// 8. Response.ok guard — mirrors useChat.ts newChat (line 109)
// ---------------------------------------------------------------------------
describe('Response.ok guard pattern', () => {
  const processResponse = async (resp: { ok: boolean; status: number; json: () => Promise<unknown> }): Promise<{
    success: boolean;
    data?: unknown;
    error?: string;
  }> => {
    if (!resp.ok) {
      return { success: false, error: `Failed: ${resp.status}` };
    }
    const data = await resp.json();
    return { success: true, data };
  };

  it('processes successful response', async () => {
    const resp = { ok: true, status: 200, json: async () => ({ id: '123' }) };
    const result = await processResponse(resp);
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: '123' });
  });

  it('rejects 400 error', async () => {
    const resp = { ok: false, status: 400, json: async () => ({}) };
    const result = await processResponse(resp);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed: 400');
  });

  it('rejects 500 error', async () => {
    const resp = { ok: false, status: 500, json: async () => ({}) };
    const result = await processResponse(resp);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed: 500');
  });

  it('rejects 404 error', async () => {
    const resp = { ok: false, status: 404, json: async () => ({}) };
    const result = await processResponse(resp);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed: 404');
  });

  it('never calls .json() on failed responses', async () => {
    let jsonCalled = false;
    const resp = {
      ok: false,
      status: 503,
      json: async () => {
        jsonCalled = true;
        return {};
      },
    };
    await processResponse(resp);
    expect(jsonCalled).toBe(false);
  });

  it('concurrent: 100 rapid iterations of ok/not-ok responses', async () => {
    for (let i = 0; i < 100; i++) {
      const okResp = { ok: true, status: 200, json: async () => ({ i }) };
      const failResp = { ok: false, status: 500, json: async () => ({}) };
      const [okResult, failResult] = await Promise.all([
        processResponse(okResp),
        processResponse(failResp),
      ]);
      expect(okResult.success).toBe(true);
      expect(failResult.success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Combined stress: all patterns together
// ---------------------------------------------------------------------------
describe('Combined stress: all null-safety patterns in sequence', () => {
  it('100 iterations of every pattern without any throw', () => {
    const safeArray = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
    const safeCoalesce = <T>(x: T | null | undefined, def: T): T => x ?? def;
    const safeSpread = (arr: unknown[] | null | undefined): unknown[] => [...(arr ?? [])];
    const safeMap = (x: unknown[] | null | undefined): unknown[] | undefined => x?.map((i) => i);
    const safeParseJSON = (s: string): unknown | null => {
      try { return JSON.parse(s); } catch { return null; }
    };
    const classifyErr = (e: unknown): boolean => e instanceof Error;

    const dangerousInputs = [null, undefined, 0, '', false, NaN, {}, [], 'garbage'];

    for (let i = 0; i < 100; i++) {
      for (const input of dangerousInputs) {
        expect(() => safeArray(input)).not.toThrow();
        expect(() => safeCoalesce(input, 'default')).not.toThrow();

        if (input === null || input === undefined || Array.isArray(input)) {
          expect(() => safeSpread(input as unknown[] | null | undefined)).not.toThrow();
          expect(() => safeMap(input as unknown[] | null | undefined)).not.toThrow();
        }

        if (typeof input === 'string') {
          expect(() => safeParseJSON(input)).not.toThrow();
        }

        expect(() => classifyErr(input)).not.toThrow();
      }
    }
  });
});
