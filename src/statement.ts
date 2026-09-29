import {
  decodeAbiParameters,
  encodeAbiParameters,
  encodePacked,
  keccak256,
  parseAbiParameters,
  type Hex,
} from "viem";

// What a release attestation says, in the Ethereum Attestation Service (EAS) schema Mizani Carbon
// registered. Only fingerprints go on chain: the Merkle root of the CSV, the SHA-256 of both
// download files, the factor count and the git commit that built them. No factor value, no
// personal data, no value transferred.

export const SCHEMA =
  "string release,bytes32 merkleRoot,bytes32 csvSha256,bytes32 xlsxSha256,uint32 factorCount,string gitCommit";
export const SCHEMA_RESOLVER = "0x0000000000000000000000000000000000000000" as const;
/** Not revocable: a release is immutable, and so is the statement about it. */
export const SCHEMA_REVOCABLE = false;

/** The schema's UID, as the SchemaRegistry derives it: keccak256(schema, resolver, revocable). */
export function schemaUid(): Hex {
  return keccak256(
    encodePacked(["string", "address", "bool"], [SCHEMA, SCHEMA_RESOLVER, SCHEMA_REVOCABLE]),
  );
}

export interface ReleaseStatement {
  release: string;
  merkleRoot: string; // 64 hex
  csvSha256: string;
  xlsxSha256: string;
  factorCount: number;
  gitCommit: string;
}

const PARAMS = parseAbiParameters(SCHEMA);
const hex32 = (h: string) => `0x${h.replace(/^0x/, "").toLowerCase()}` as Hex;

export function encodeStatement(s: ReleaseStatement): Hex {
  return encodeAbiParameters(PARAMS, [
    s.release,
    hex32(s.merkleRoot),
    hex32(s.csvSha256),
    hex32(s.xlsxSha256),
    s.factorCount,
    s.gitCommit,
  ]);
}

export function decodeStatement(data: Hex): ReleaseStatement {
  const [release, merkleRoot, csvSha256, xlsxSha256, factorCount, gitCommit] = decodeAbiParameters(
    PARAMS,
    data,
  );
  const bare = (h: string) => h.replace(/^0x/, "").toLowerCase();
  return {
    release,
    merkleRoot: bare(merkleRoot),
    csvSha256: bare(csvSha256),
    xlsxSha256: bare(xlsxSha256),
    factorCount: Number(factorCount),
    gitCommit,
  };
}

// The contract calls used, from the deployed contracts' ABIs (eas-contracts, deployments/base*).
export const EAS_ABI = [
  {
    type: "function",
    name: "attest",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getAttestation",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "schema", type: "bytes32" },
          { name: "time", type: "uint64" },
          { name: "expirationTime", type: "uint64" },
          { name: "revocationTime", type: "uint64" },
          { name: "refUID", type: "bytes32" },
          { name: "recipient", type: "address" },
          { name: "attester", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "Attested",
    anonymous: false,
    inputs: [
      { name: "recipient", type: "address", indexed: true },
      { name: "attester", type: "address", indexed: true },
      { name: "uid", type: "bytes32", indexed: false },
      { name: "schemaUID", type: "bytes32", indexed: true },
    ],
  },
] as const;

export const SCHEMA_REGISTRY_ABI = [
  {
    type: "function",
    name: "register",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "getSchema",
    stateMutability: "view",
    inputs: [{ name: "uid", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "uid", type: "bytes32" },
          { name: "resolver", type: "address" },
          { name: "revocable", type: "bool" },
          { name: "schema", type: "string" },
        ],
      },
    ],
  },
] as const;
