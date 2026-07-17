import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';

// テスト用の D1Database 互換モックを作成する関数
export function createMockD1(): D1Database {
  const db = new Database(':memory:');

  // 初期スキーマと追加スキーマの適用
  const schemaPath0 = join(__dirname, '../migrations/0000_initial_schema.sql');
  const schemaPath1 = join(__dirname, '../migrations/0001_add_invitations.sql');

  const sql0 = readFileSync(schemaPath0, 'utf8');
  const sql1 = readFileSync(schemaPath1, 'utf8');

  // SQLite 内でスキーマを実行
  db.exec(sql0);
  db.exec(sql1);

  const mockD1Db = {
    prepare(sql: string) {
      const stmt = db.prepare(sql);
      return {
        bind(...values: any[]) {
          const normalizedValues = values.map((v) =>
            typeof v === 'boolean' ? (v ? 1 : 0) : v
          );
          return {
            async first(key?: string) {
              const res = stmt.get(...normalizedValues);
              if (res == null) return null;
              if (key) return (res as any)[key];
              return res;
            },
            async all() {
              const results = stmt.all(...normalizedValues);
              return { results, success: true };
            },
            async run() {
              const info = stmt.run(...normalizedValues);
              return {
                success: true,
                changes: info.changes,
                lastRowId: info.lastInsertRowid,
              };
            },
            async raw() {
              return stmt.raw(true).all(...normalizedValues) as any;
            },
          };
        },
        async first(key?: string) {
          const res = stmt.get();
          if (res == null) return null;
          if (key) return (res as any)[key];
          return res;
        },
        async all() {
          const results = stmt.all();
          return { results, success: true };
        },
        async run() {
          const info = stmt.run();
          return {
            success: true,
            changes: info.changes,
            lastRowId: info.lastInsertRowid,
          };
        },
        async raw() {
          return stmt.raw(true).all() as any;
        },
      };
    },
    async exec(sql: string) {
      db.exec(sql);
      return { count: 0, duration: 0 };
    },
    async batch(statements: any[]) {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
  };

  return mockD1Db as unknown as D1Database;
}

// テスト用の Durable Object 互換モックを作成する関数
export function createMockRoomSession() {
  const broadcasts: any[] = [];

  const mockNamespace = {
    idFromName(name: string) {
      return {
        toString: () => name,
        equals: (other: any) => other.toString() === name,
      };
    },
    get(id: any) {
      return {
        async fetch(req: Request) {
          if (req.method === 'POST') {
            const body = await req.json();
            broadcasts.push({ roomId: id.toString(), payload: body });
          }
          return new Response('ok', { status: 200 });
        },
      };
    },
    // 検証用のブロードキャスト履歴取得
    getBroadcasts() {
      return broadcasts;
    },
    clearBroadcasts() {
      broadcasts.length = 0;
    },
  };

  return mockNamespace;
}
