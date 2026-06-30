---
name: Drizzle ORM 0.45 db.execute() result shape
description: db.execute(sql`...`) no longer returns { rows: [] } in drizzle-orm 0.45
---

## Rule
Cast `db.execute()` result directly as an array: `(result as unknown as any[]).map(...)`. Do NOT use `.rows`.

**Why:** drizzle-orm 0.45 changed the RowList type from an object with a `.rows` property to an iterable array directly. The old pattern `result.rows.map(...)` causes a TypeScript error "Property 'rows' does not exist on type 'RowList'".

**How to apply:** Any raw SQL query using `db.execute(sql\`...\`)` should cast the result: `(await db.execute(sql\`...\`)) as unknown as any[]`.
