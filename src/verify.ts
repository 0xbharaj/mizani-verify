import { createPublicClient, http, type Hex } from "viem";
import { csvMerkleRoot, fileSha256 } from "./merkle.ts";
import {
  DEFAULT_NETWORK,
  network as networkConfig,
  type NetworkName,
  viemChain,
} from "./networks.ts";
import { decodeStatement, EAS_ABI, schemaUid } from "./statement.ts";

// Checks a release CSV exactly as downloaded: recomputes its SHA-256 and Merkle root, then
// compares them with what the API publishes for the release and with the on-chain attestation.
// Needs no account or key, and prints nothing, so a command line or a web page can present it.

export interface Check {
  /** What was compared with the file: the API's published record, or the attestation. */
  against: "api" | "attestation";
  label: string;
  ok: boolean;
  detail?: string;
}

/** The fields of an EAS attestation the checks read. */
export interface AttestationRecord {
  schema: Hex;
  revocationTime: bigint;
  attester: Hex;
  data: Hex;
}

export interface VerifyOptions {
  /** The CSV file's exact bytes. */
  csv: Uint8Array;
  /** The release version, e.g. "2026.1". Needed with `api`; checked against the attestation. */
  release?: string;
  /** The API's base URL, e.g. https://mizani-api.fly.dev */
  api?: string;
  /** The attestation UID to check against. */
  uid?: string;
  network?: NetworkName;
  /** An RPC endpoint for the network; its public one otherwise. */
  rpcUrl?: string;
  fetch?: typeof fetch;
  /** Reads an attestation from EAS; a viem client on the network otherwise. */
  getAttestation?: (uid: Hex) => Promise<AttestationRecord>;
}

export interface VerifyResult {
  sha256: string;
  merkleRoot: string;
  attestation?: { url: string; attester: string };
  checks: Check[];
  ok: boolean;
}

export async function verifyRelease(opts: VerifyOptions): Promise<VerifyResult> {
  const sha256 = fileSha256(opts.csv);
  const root = csvMerkleRoot(new TextDecoder().decode(opts.csv));
  const checks: Check[] = [];
  const check = (against: Check["against"], label: string, ok: boolean, detail?: string) =>
    checks.push(detail === undefined ? { against, label, ok } : { against, label, ok, detail });

  if (opts.api) {
    if (!opts.release) throw new Error("name the release (YYYY.N) to check it against the API");
    const url = `${opts.api.replace(/\/+$/, "")}/v1/releases/${opts.release}`;
    const res = await (opts.fetch ?? fetch)(url);
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const r = (await res.json()) as {
      fingerprint: { merkle_root: string } | null;
      downloads: { format: string; sha256: string }[];
    };
    check(
      "api",
      "API fingerprint",
      r.fingerprint?.merkle_root === root,
      r.fingerprint?.merkle_root ?? "none",
    );
    const csv = r.downloads.find((d) => d.format === "csv");
    check("api", "API file hash", csv?.sha256 === sha256, csv?.sha256 ?? "none");
  }

  let attestation: VerifyResult["attestation"];
  if (opts.uid) {
    const name = opts.network ?? DEFAULT_NETWORK;
    const net = networkConfig(name);
    const read =
      opts.getAttestation ??
      ((uid: Hex) =>
        createPublicClient({
          chain: viemChain(name),
          transport: http(opts.rpcUrl ?? net.rpcUrl),
        }).readContract({
          address: net.eas,
          abi: EAS_ABI,
          functionName: "getAttestation",
          args: [uid],
        }));
    const a = await read(opts.uid as Hex);
    attestation = { url: net.attestationUrl(opts.uid), attester: a.attester };
    check("attestation", "schema", a.schema.toLowerCase() === schemaUid());
    check("attestation", "not revoked", a.revocationTime === 0n);
    const s = decodeStatement(a.data);
    if (opts.release) check("attestation", "release", s.release === opts.release, s.release);
    check("attestation", "on-chain Merkle root", s.merkleRoot === root, s.merkleRoot);
    check("attestation", "on-chain file hash", s.csvSha256 === sha256, s.csvSha256);
  }

  return {
    sha256,
    merkleRoot: root,
    ...(attestation ? { attestation } : {}),
    checks,
    ok: checks.every((c) => c.ok),
  };
}
