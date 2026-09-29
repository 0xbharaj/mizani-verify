import { describe, expect, it } from "vitest";
import { decodeStatement, encodeStatement, schemaUid, type ReleaseStatement } from "./statement.ts";

const TEST_STATEMENT: ReleaseStatement = {
  release: "2099.1",
  merkleRoot: "ab".repeat(32),
  csvSha256: "cd".repeat(32),
  xlsxSha256: "ef".repeat(32),
  factorCount: 34,
  gitCommit: "0".repeat(40),
};

describe("the attestation statement", () => {
  it("round-trips through the schema's ABI encoding", () => {
    expect(decodeStatement(encodeStatement(TEST_STATEMENT))).toEqual(TEST_STATEMENT);
  });

  it("has the UID the schema was registered under on Base Sepolia", () => {
    // SchemaRegistry.register returned this UID for the schema (BUILD_PLAN 5a.3); any change to
    // the schema string, resolver or revocability would give another one.
    expect(schemaUid()).toBe("0xb21ddb71f31690489dca765600de71b816ab50635f1464aaef9687bc7dbcdd65");
  });
});
