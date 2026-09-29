import type { Hex } from "viem";
import { describe, expect, it } from "vitest";
import { main } from "./cli.ts";
import { csvMerkleRoot, fileSha256 } from "./merkle.ts";
import { encodeStatement, schemaUid } from "./statement.ts";
import { verifyRelease, type AttestationRecord } from "./verify.ts";

// verifyRelease against stand-ins for the API and for EAS, with a file that matches and one that
// was changed after download.

const CSV = "id,value\nTEST_1,TEST_0.5\nTEST_2,TEST_0.7\n";
const bytes = new TextEncoder().encode(CSV);
const root = csvMerkleRoot(CSV);
const sha = fileSha256(bytes);
const UID = `0x${"12".repeat(32)}`;

const api = (fingerprint: string, fileSha: string) =>
  (async () =>
    new Response(
      JSON.stringify({
        fingerprint: { merkle_root: fingerprint },
        downloads: [{ format: "csv", sha256: fileSha }],
      }),
    )) as typeof fetch;

const attestation =
  (over: Partial<AttestationRecord> = {}, merkleRoot = root) =>
  async (): Promise<AttestationRecord> => ({
    schema: schemaUid(),
    revocationTime: 0n,
    attester: `0x${"ab".repeat(20)}` as Hex,
    data: encodeStatement({
      release: "2099.1",
      merkleRoot,
      csvSha256: sha,
      xlsxSha256: "00".repeat(32),
      factorCount: 2,
      gitCommit: "0".repeat(40),
    }),
    ...over,
  });

describe("verifyRelease", () => {
  it("passes a file that matches the API and the attestation", async () => {
    const r = await verifyRelease({
      csv: bytes,
      release: "2099.1",
      api: "https://api.test/",
      fetch: api(root, sha),
      uid: UID,
      getAttestation: attestation(),
    });
    expect(r).toMatchObject({ sha256: sha, merkleRoot: root, ok: true });
    expect(r.checks.map((c) => `${c.against}:${c.label}`)).toEqual([
      "api:API fingerprint",
      "api:API file hash",
      "attestation:schema",
      "attestation:not revoked",
      "attestation:release",
      "attestation:on-chain Merkle root",
      "attestation:on-chain file hash",
    ]);
    expect(r.attestation?.url).toBe(`https://base-sepolia.easscan.org/attestation/view/${UID}`);
  });

  it("fails a changed file, another schema, or a revoked attestation", async () => {
    const changed = new TextEncoder().encode(CSV.replace("TEST_0.7", "TEST_0.8"));
    const r = await verifyRelease({
      csv: changed,
      release: "2099.1",
      api: "https://api.test",
      fetch: api(root, sha),
      uid: UID,
      getAttestation: attestation(),
    });
    expect(r.ok).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([
      "API fingerprint",
      "API file hash",
      "on-chain Merkle root",
      "on-chain file hash",
    ]);
    const other = await verifyRelease({
      csv: bytes,
      uid: UID,
      getAttestation: attestation({ schema: `0x${"00".repeat(32)}`, revocationTime: 1n }),
    });
    expect(other.checks.filter((c) => !c.ok).map((c) => c.label)).toEqual([
      "schema",
      "not revoked",
    ]);
  });

  it("needs the release to ask the API, and reports an API error", async () => {
    await expect(verifyRelease({ csv: bytes, api: "https://api.test" })).rejects.toThrow(
      /name the release/,
    );
    await expect(
      verifyRelease({
        csv: bytes,
        release: "2099.9",
        api: "https://api.test",
        fetch: (async () => new Response("{}", { status: 404 })) as typeof fetch,
      }),
    ).rejects.toThrow(/answered 404/);
  });
});

describe("the command line", () => {
  it("prints usage and exits 1 without a file or a known command", async () => {
    const lines: string[] = [];
    expect(await main([], (l) => lines.push(l))).toBe(1);
    expect(await main(["check", "x.csv"], (l) => lines.push(l))).toBe(1);
    expect(lines.join("\n")).toMatch(/usage:/);
  });
});
