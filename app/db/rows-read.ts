/**
 * A test-only meter of D1 rows read (CLUBS-46), so the E2E suite can hold a
 * page to its read budget (`app/stats/README.md`). The `/__test/*` routes turn
 * it on, so it never runs in production; until then `metered` returns the
 * binding untouched.
 *
 * D1 reports `meta.rows_read` from `all()`, `run()` and `batch()`, but not from
 * `raw()` or `first()`, which Drizzle uses for most selects. For those the
 * meter runs a read-only statement once more through `all()` just to read its
 * meta. That doubles the work, which is fine in tests and never happens
 * elsewhere.
 */

let rowsRead: number | null = null;

/** Starts counting rows read through every `getDb`. Idempotent. */
export function enableRowsReadMeter(): void {
  rowsRead ??= 0;
}

/** Rows read since the last call (or since the meter started), resetting the count. */
export function takeRowsRead(): number {
  const count = rowsRead ?? 0;
  if (rowsRead !== null) rowsRead = 0;
  return count;
}

/** The binding, wrapped to count rows read when the meter is on. */
export function metered(d1: D1Database): D1Database {
  if (rowsRead === null) return d1;
  return new Proxy(d1, {
    get(target, property) {
      if (property === "prepare") {
        return (query: string) =>
          meterStatement(target.prepare(query), isReadOnly(query));
      }
      if (property === "batch") {
        return async (statements: D1PreparedStatement[]) => {
          const results = await target.batch(
            statements.map(
              (statement) => unmetered.get(statement) ?? statement,
            ),
          );
          for (const result of results) count(result.meta);
          return results;
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/** The real statement behind each metered one, since `batch` takes only real ones. */
const unmetered = new WeakMap<D1PreparedStatement, D1PreparedStatement>();

function meterStatement(
  statement: D1PreparedStatement,
  readOnly: boolean,
): D1PreparedStatement {
  /** Re-runs a read through `all()`, whose meta has the count. */
  const countRead = async () => {
    if (readOnly) count((await statement.all()).meta);
  };
  const wrapped = {
    bind: (...values: unknown[]) =>
      meterStatement(statement.bind(...values), readOnly),
    async all() {
      const result = await statement.all();
      count(result.meta);
      return result;
    },
    async run() {
      const result = await statement.run();
      count(result.meta);
      return result;
    },
    async first(column?: string) {
      await countRead();
      return column === undefined ? statement.first() : statement.first(column);
    },
    async raw(options?: { columnNames?: boolean }) {
      await countRead();
      // D1's overloads differ only in the column-names row; pass it through.
      return statement.raw(options as { columnNames: true });
    },
  } as unknown as D1PreparedStatement;
  unmetered.set(wrapped, statement);
  return wrapped;
}

function isReadOnly(query: string): boolean {
  return /^\s*(select|with)\b/i.test(query);
}

function count(meta: { rows_read?: number } | undefined): void {
  if (rowsRead !== null) rowsRead += meta?.rows_read ?? 0;
}
