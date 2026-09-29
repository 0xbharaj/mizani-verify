# @mizani/verify

Check a [Mizani Carbon](https://mizani-carbon.co) release download against its published
fingerprint and its on-chain attestation, without trusting Mizani's servers. No account, no API
key, no database.

Mizani Carbon publishes emission factors as immutable, versioned releases. Each release's
fingerprint (a Merkle root over the rows of its CSV download) and the SHA-256 of its files are
attested with the [Ethereum Attestation Service](https://attest.org) (EAS). This package
recomputes both from a file you hold and compares them with the API and the chain. It also proves
that a single row belongs to a release.

## Install

```bash
npm install -g @mizani/verify     # or run it once with: npx @mizani/verify release …
```

Or use the [browser verifier](https://mizani-carbon.co/verify): drop the file in, nothing to
install, and the file never leaves your browser.

## Command line

```bash
mizani-verify release mizani-2026.1.csv \
  --api https://mizani-api.fly.dev \
  --uid 0xd55f3f0b8c5db98745cdfb7bc687aae5eb82890bff354d14fae559f0b782201e
```

```text
  SHA-256      9dc3853cd5b14150c608e2133956ebea935e5aaff8a4876c2a33071e54e45cdc
  Merkle root  a1dd2701be1386f8e64f7fc1b7e07594d1344f68be7fc989059474c20f8861b3
  ok   API fingerprint
  ok   API file hash
  attestation  https://base-sepolia.easscan.org/attestation/view/0xd55f3f0b…201e
  ok   schema
  ok   not revoked
  ok   release: 2026.1
  ok   on-chain Merkle root
  ok   on-chain file hash

verified
```

- `--api URL` compares with the release the API publishes. The release version is read from the
  file name (`mizani-YYYY.N.csv`) or given with `--release YYYY.N`.
- `--uid 0x…` compares with an attestation; `--network base-sepolia|sepolia|base` (default
  `base-sepolia`). Set `ATTEST_RPC_URL` to use your own RPC endpoint.
- Exit code 0 when every check passes, 1 otherwise.

`mizani-verify prove mizani-2026.1.csv <factor id>` prints one row's leaf and its Merkle proof as
JSON, the same proof the API serves at `/v1/releases/{version}/proof/{factor_id}`.

## Library

The same checks as a function that prints nothing, for scripts and web pages. Hashing is pure
JavaScript, so it runs in Node and in browsers.

```ts
import { verifyRelease, csvMerkleRoot, verifyProof, leafHash } from "@mizani/verify";

const result = await verifyRelease({
  csv: new Uint8Array(await file.arrayBuffer()),
  release: "2026.1",
  api: "https://mizani-api.fly.dev",
  uid: "0xd55f3f0b8c5db98745cdfb7bc687aae5eb82890bff354d14fae559f0b782201e",
});
result.ok; // true when every check passed
result.checks; // [{ against: "api" | "attestation", label, ok, detail? }, …]
```

## Specification

Everything here can be reimplemented in another language; `test-vectors.json` holds inputs and
expected outputs to check a reimplementation against.

### Fingerprint (`mizani-merkle-sha256-v1`)

1. Read the CSV as UTF-8, per RFC 4180 (fields may be quoted; `""` is a quote inside a quoted
   field; lines end with LF or CRLF). The first record is the header.
2. For each row after the header, in file order, take its field values exactly as strings, in
   column order, and serialise them as a JSON array with no whitespace (JavaScript
   `JSON.stringify`). This is the row's **leaf text**.
3. `leaf = SHA-256(0x00 || UTF-8(leaf text))`
4. Pair nodes left to right: `node = SHA-256(0x01 || left || right)`. On each level, an unpaired
   last node moves up unchanged. The last remaining node is the **Merkle root**, written as
   lower-case hex.

The `0x00`/`0x01` prefixes (as in RFC 6962) stop a leaf from being passed off as an inner node.

A proof is a list of `{ position, hash }` steps from the leaf up: when `position` is `"left"`,
hash `0x01 || sibling || current`; when `"right"`, hash `0x01 || current || sibling`. The proof is
valid when the final hash equals the root.

### Attestation

EAS schema (not revocable, no resolver):

```text
string release,bytes32 merkleRoot,bytes32 csvSha256,bytes32 xlsxSha256,uint32 factorCount,string gitCommit
```

Schema UID `0xb21ddb71f31690489dca765600de71b816ab50635f1464aaef9687bc7dbcdd65`, which is
`keccak256(abi.encodePacked(schema, resolver, revocable))` as the EAS SchemaRegistry derives it.
Each release's attestation refers (`refUID`) to the previous release's attestation on the same
network, so the chain also records the sequence of releases.

| Network        | EAS contract                                 |
| -------------- | -------------------------------------------- |
| Base Sepolia   | `0x4200000000000000000000000000000000000021` |
| Ethereum Sepolia | `0xC2679fBD37d54388Ce493F1DB75320D236e1815e` |
| Base           | `0x4200000000000000000000000000000000000021` |

A download verifies when: the attestation uses this schema and is not revoked; its `release` is
the file's release; its `merkleRoot` equals the root computed from the file; and its `csvSha256`
equals the SHA-256 of the file's exact bytes.

## Development

```bash
pnpm install && pnpm test    # unit tests and the test vectors
pnpm pack                    # builds dist/ and packs what npm would get
```

Publish with `pnpm publish`, not `npm publish`: `publishConfig` points the published package's
exports and command at the compiled `dist/`.

## Licence

MIT. See [LICENSE](LICENSE).
