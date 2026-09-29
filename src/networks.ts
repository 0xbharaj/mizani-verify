import type { Chain } from "viem";
import { base, baseSepolia, sepolia } from "viem/chains";

// Where release fingerprints are attested: the Ethereum Attestation Service on Base, with
// Ethereum Sepolia as a second testnet. Addresses are from the EAS contracts repository's
// deployment list (ethereum-attestation-service/eas-contracts, README "Base", "Base Sepolia" and
// "Sepolia"): the Base networks use the OP Stack predeploys.

export const NETWORKS = {
  "base-sepolia": {
    chainId: 84532,
    name: "Base Sepolia (testnet)",
    rpcUrl: "https://sepolia.base.org",
    eas: "0x4200000000000000000000000000000000000021",
    schemaRegistry: "0x4200000000000000000000000000000000000020",
    attestationUrl: (uid: string) => `https://base-sepolia.easscan.org/attestation/view/${uid}`,
    txUrl: (hash: string) => `https://sepolia.basescan.org/tx/${hash}`,
    mainnet: false,
  },
  sepolia: {
    chainId: 11155111,
    name: "Ethereum Sepolia (testnet)",
    rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
    eas: "0xC2679fBD37d54388Ce493F1DB75320D236e1815e",
    schemaRegistry: "0x0a7E2Ff54e76B8E6659aedc9103FB21c038050D0",
    attestationUrl: (uid: string) => `https://sepolia.easscan.org/attestation/view/${uid}`,
    txUrl: (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`,
    mainnet: false,
  },
  base: {
    chainId: 8453,
    name: "Base",
    rpcUrl: "https://mainnet.base.org",
    eas: "0x4200000000000000000000000000000000000021",
    schemaRegistry: "0x4200000000000000000000000000000000000020",
    attestationUrl: (uid: string) => `https://base.easscan.org/attestation/view/${uid}`,
    txUrl: (hash: string) => `https://basescan.org/tx/${hash}`,
    mainnet: true,
  },
} as const;

export type NetworkName = keyof typeof NETWORKS;
export const NETWORK_NAMES = Object.keys(NETWORKS) as NetworkName[];
export const DEFAULT_NETWORK: NetworkName = "base-sepolia";

/** The viem chain for a network. */
export function viemChain(name: NetworkName): Chain {
  return name === "base" ? base : name === "sepolia" ? sepolia : baseSepolia;
}

export function network(name: string) {
  if (!(name in NETWORKS)) {
    throw new Error(`unknown network "${name}"; use ${Object.keys(NETWORKS).join(" or ")}`);
  }
  return NETWORKS[name as NetworkName];
}
