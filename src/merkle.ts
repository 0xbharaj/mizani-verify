import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes, utf8ToBytes } from "@noble/hashes/utils";
import { parseCsvRecords } from "./csv.ts";

// A release's fingerprint: a Merkle root over the rows of its CSV download, so anyone holding
// the file can recompute it, and a proof that one row belongs to the release.
//
//   leaf  = SHA-256( 0x00 || UTF-8( JSON array of the row's values, in the CSV's column order ) )
//   node  = SHA-256( 0x01 || left || right )
//   Leaves are in the CSV's row order. On each level an unpaired last node moves up unchanged.
//
// The 0x00/0x01 prefixes (as in RFC 6962) stop a leaf from being passed off as an inner node.
// Pure JavaScript hashing, so the same code runs in Node and in a browser.

export const FINGERPRINT_ALGORITHM = "mizani-merkle-sha256-v1" as const;

const LEAF = Uint8Array.of(0);
const NODE = Uint8Array.of(1);

function hash(...parts: Uint8Array[]): Uint8Array {
  const h = sha256.create();
  for (const p of parts) h.update(p);
  return h.digest();
}

/** Lower-case hex, no 0x prefix. */
export const toHex = (bytes: Uint8Array): string => bytesToHex(bytes);

/** The SHA-256 of a file's exact bytes, as hex. */
export const fileSha256 = (bytes: Uint8Array): string => bytesToHex(sha256(bytes));

/** The exact string hashed for a row: its values as a JSON array, in column order. */
export function leafText(values: readonly string[]): string {
  return JSON.stringify(values);
}

export function leafHash(text: string): Uint8Array {
  return hash(LEAF, utf8ToBytes(text));
}

function levels(leaves: readonly Uint8Array[]): Uint8Array[][] {
  if (leaves.length === 0) throw new Error("a release fingerprint needs at least one row");
  const out: Uint8Array[][] = [[...leaves]];
  while ((out.at(-1)?.length ?? 0) > 1) {
    const level = out.at(-1) ?? [];
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as Uint8Array;
      const right = level[i + 1];
      next.push(right ? hash(NODE, left, right) : left);
    }
    out.push(next);
  }
  return out;
}

export function merkleRoot(leaves: readonly Uint8Array[]): Uint8Array {
  return levels(leaves).at(-1)?.[0] as Uint8Array;
}

export interface ProofStep {
  /** Where the sibling sits: hash (sibling || current) when "left", (current || sibling) when "right". */
  position: "left" | "right";
  hash: string;
}

export function merkleProof(leaves: readonly Uint8Array[], index: number): ProofStep[] {
  if (index < 0 || index >= leaves.length) throw new Error(`no leaf ${index}`);
  const proof: ProofStep[] = [];
  let i = index;
  for (const level of levels(leaves).slice(0, -1)) {
    const sibling = i % 2 === 0 ? level[i + 1] : level[i - 1];
    if (sibling) {
      proof.push({ position: i % 2 === 0 ? "right" : "left", hash: bytesToHex(sibling) });
    }
    i = Math.floor(i / 2);
  }
  return proof;
}

export function verifyProof(leaf: Uint8Array, proof: readonly ProofStep[], root: string): boolean {
  let h = leaf;
  for (const step of proof) {
    const sibling = hexToBytes(step.hash);
    h = step.position === "left" ? hash(NODE, sibling, h) : hash(NODE, h, sibling);
  }
  return bytesToHex(h) === root.toLowerCase();
}

/** Every row of a release CSV, with its leaf text and hash. */
export function csvLeaves(csv: string) {
  const [header, ...body] = parseCsvRecords(csv);
  if (!header) return [];
  return body.map((values) => {
    const text = leafText(values);
    const row = Object.fromEntries(header.map((h, j) => [h, values[j] ?? ""]));
    return { row, text, hash: leafHash(text) };
  });
}

/** The Merkle root of a release CSV, as hex. */
export function csvMerkleRoot(csv: string): string {
  return bytesToHex(merkleRoot(csvLeaves(csv).map((l) => l.hash)));
}
