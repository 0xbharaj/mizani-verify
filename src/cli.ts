import { readFile } from "node:fs/promises";
import { csvLeaves, merkleProof, merkleRoot, toHex } from "./merkle.ts";
import { NETWORK_NAMES, type NetworkName } from "./networks.ts";
import { verifyRelease } from "./verify.ts";

// mizani-verify release <mizani-YYYY.N.csv> [--api URL] [--uid 0x… [--network …]] [--release YYYY.N]
//   Recomputes the file's SHA-256 and Merkle root and checks them against the API and the
//   attestation. Exit code 1 on any mismatch.
// mizani-verify prove <mizani-YYYY.N.csv> <factor id>
//   Prints the row's leaf and its Merkle proof against the file's root, as JSON.

const USAGE = `usage:
  mizani-verify release <mizani-YYYY.N.csv> [--api URL] [--uid 0x… [--network ${NETWORK_NAMES.join("|")}]] [--release YYYY.N]
  mizani-verify prove <mizani-YYYY.N.csv> <factor id>`;

type Log = (line: string) => void;

export async function main(argv: readonly string[], log: Log = console.log): Promise<number> {
  const [command, ...args] = argv;
  const option = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const positional = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
  const [file, id] = positional;
  if (!file || (command !== "release" && command !== "prove") || (command === "prove" && !id)) {
    log(USAGE);
    return 1;
  }
  const bytes = new Uint8Array(await readFile(file));

  if (command === "prove") {
    const leaves = csvLeaves(new TextDecoder().decode(bytes));
    const index = leaves.findIndex((l) => l.row.id === id);
    if (index < 0) {
      log(`no row with id ${id} in ${file}`);
      return 1;
    }
    const hashes = leaves.map((l) => l.hash);
    log(
      JSON.stringify(
        {
          merkle_root: toHex(merkleRoot(hashes)),
          leaf_index: index,
          leaf_count: leaves.length,
          leaf: leaves[index]?.text,
          proof: merkleProof(hashes, index),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  const release = /mizani-(\d{4}\.\d+)\.csv$/.exec(file)?.[1] ?? option("--release");
  const uid = option("--uid");
  const api = option("--api");
  const rpcUrl = process.env.ATTEST_RPC_URL;
  const result = await verifyRelease({
    csv: bytes,
    ...(release ? { release } : {}),
    ...(api ? { api } : {}),
    ...(uid ? { uid, network: (option("--network") ?? "base-sepolia") as NetworkName } : {}),
    ...(rpcUrl ? { rpcUrl } : {}),
  });

  log(`${file}\n  SHA-256      ${result.sha256}\n  Merkle root  ${result.merkleRoot}`);
  const line = (c: { label: string; ok: boolean; detail?: string }) =>
    log(`  ${c.ok ? "ok  " : "FAIL"} ${c.label}${c.detail ? `: ${c.detail}` : ""}`);
  // The API's checks come first, then the attestation's, as they are made.
  const onChain = result.checks.findIndex((c) => c.label === "schema");
  result.checks.slice(0, onChain < 0 ? undefined : onChain).forEach(line);
  if (result.attestation) {
    log(`  attestation  ${result.attestation.url}\n  attester     ${result.attestation.attester}`);
    result.checks.slice(onChain).forEach(line);
  }
  const failed = result.checks.filter((c) => !c.ok).length;
  log(failed ? `\n${failed} check(s) failed` : "\nverified");
  return failed ? 1 : 0;
}
