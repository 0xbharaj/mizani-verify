import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  csvLeaves,
  csvMerkleRoot,
  fileSha256,
  leafHash,
  merkleProof,
  merkleRoot,
  toHex,
  verifyProof,
} from "./merkle.ts";

// The tree against a separately written reference on Node's own SHA-256, and the published test
// vectors (test-vectors.json) that other implementations check themselves against.

const h = (...parts: (Uint8Array | number)[]) => {
  const hash = createHash("sha256");
  for (const p of parts) hash.update(typeof p === "number" ? Uint8Array.of(p) : p);
  return new Uint8Array(hash.digest());
};

/** Reference: recursive, pairing left to right, carrying an odd node up unchanged. */
function referenceRoot(nodes: Uint8Array[]): Uint8Array {
  if (nodes.length === 1) return nodes[0] as Uint8Array;
  const next: Uint8Array[] = [];
  for (let i = 0; i < nodes.length; i += 2) {
    const r = nodes[i + 1];
    next.push(r ? h(1, nodes[i] as Uint8Array, r) : (nodes[i] as Uint8Array));
  }
  return referenceRoot(next);
}

describe("the Merkle tree", () => {
  it("matches the reference for every size from 1 to 40, and every proof verifies", () => {
    for (let n = 1; n <= 40; n++) {
      const leaves = Array.from({ length: n }, (_, i) => leafHash(`["TEST_row_${i}"]`));
      const root = merkleRoot(leaves);
      expect(toHex(root), `n=${n}`).toBe(toHex(referenceRoot(leaves)));
      leaves.forEach((leaf, i) => {
        expect(verifyProof(leaf, merkleProof(leaves, i), toHex(root)), `n=${n} i=${i}`).toBe(true);
      });
    }
  });

  it("separates leaves from inner nodes (0x00 and 0x01 prefixes)", () => {
    const a = leafHash('["TEST_a"]');
    const b = leafHash('["TEST_b"]');
    expect(toHex(a)).toBe(toHex(h(0, new TextEncoder().encode('["TEST_a"]'))));
    expect(toHex(merkleRoot([a, b]))).toBe(toHex(h(1, a, b)));
    expect(verifyProof(a, merkleProof([a, b], 0), toHex(merkleRoot([b, a])))).toBe(false);
  });

  it("rejects a proof for a changed row", () => {
    const leaves = ["1", "2", "3", "4", "5"].map((v) => leafHash(`["TEST_${v}"]`));
    const root = toHex(merkleRoot(leaves));
    expect(verifyProof(leafHash('["TEST_3x"]'), merkleProof(leaves, 2), root)).toBe(false);
  });

  it("refuses an empty release", () => {
    expect(() => merkleRoot([])).toThrow(/at least one row/);
  });
});

describe("a CSV's fingerprint", () => {
  const csv = 'id,name,value\nTEST_1,"TEST_a, quoted",TEST_1.5\nTEST_2,"TEST_""b""",\n';

  it("hashes each row's exact field strings, as a JSON array in column order", () => {
    const leaves = csvLeaves(csv);
    expect(leaves.map((l) => l.text)).toEqual([
      '["TEST_1","TEST_a, quoted","TEST_1.5"]',
      '["TEST_2","TEST_\\"b\\"",""]',
    ]);
    expect(leaves[1]?.row).toEqual({ id: "TEST_2", name: 'TEST_"b"', value: "" });
  });

  it("is the same with CRLF line endings, and changes with any value", () => {
    const root = csvMerkleRoot(csv);
    expect(csvMerkleRoot(csv.replaceAll("\n", "\r\n"))).toBe(root);
    expect(csvMerkleRoot(csv.replace("TEST_1.5", "TEST_1.6"))).not.toBe(root);
  });

  it("hashes the file's exact bytes for its SHA-256", () => {
    const bytes = new TextEncoder().encode(csv);
    expect(fileSha256(bytes)).toBe(createHash("sha256").update(bytes).digest("hex"));
  });
});

interface Vector {
  csv: string;
  leaves: string[];
  merkle_root: string;
  proofs: { position: "left" | "right"; hash: string }[][];
}

describe("the published test vectors", () => {
  const vectors = JSON.parse(
    readFileSync(new URL("../test-vectors.json", import.meta.url), "utf8"),
  ) as { algorithm: string; vectors: Vector[] };

  it("cover one to five rows, and this implementation reproduces every hash and proof", () => {
    expect(vectors.algorithm).toBe("mizani-merkle-sha256-v1");
    expect(vectors.vectors.map((v) => v.leaves.length)).toEqual([1, 2, 3, 4, 5]);
    for (const v of vectors.vectors) {
      const leaves = csvLeaves(v.csv);
      expect(leaves.map((l) => toHex(l.hash))).toEqual(v.leaves);
      expect(csvMerkleRoot(v.csv)).toBe(v.merkle_root);
      const hashes = leaves.map((l) => l.hash);
      expect(hashes.map((_, i) => merkleProof(hashes, i))).toEqual(v.proofs);
      expect(toHex(merkleRoot(hashes))).toBe(toHex(referenceRoot(hashes)));
    }
  });
});
