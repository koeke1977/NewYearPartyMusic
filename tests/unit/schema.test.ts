import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const schemaPath = fileURLToPath(new URL("../../db/schema.sql", import.meta.url));

describe("test D1 bootstrap schema", () => {
  it("keeps event access-code verification in the Worker secret instead of an unused D1 hash column", () => {
    const schema = readFileSync(schemaPath, "utf8");
    expect(schema).toContain("CREATE TABLE IF NOT EXISTS events");
    expect(schema).not.toContain("event_code_hash");
    expect(schema).not.toContain("REPLACE_WITH_HASHED_EVENT_CODE");
  });
});
