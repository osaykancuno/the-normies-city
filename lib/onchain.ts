import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

// Normies NFT — ERC-721 on Ethereum mainnet.
// Previous code had the wrong contract (0x9435…), which is a related but
// distinct contract (Normies "Asset" / Canvas burn token, ERC-1155). The
// holder buildings in the city are the 10 000 ERC-721 Normies, so we listen
// on this address for Transfer events to detect new holders.
export const NORMIES_CONTRACT = "0x9Eb6E2025B64f340691e424b7fe7022fFDE12438" as const;

const ALCHEMY = process.env.ALCHEMY_API_KEY
  ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  : null;
const PUBLIC_RPC = "https://eth.llamarpc.com";

export const ethClient = createPublicClient({
  chain: mainnet,
  transport: http(ALCHEMY ?? PUBLIC_RPC, { batch: true }),
});

// Standard ERC-721 Transfer event.
export const transferEvent = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "tokenId", type: "uint256", indexed: true },
  ],
} as const;

// Kept for backwards-compat with any older import; aliases the ERC-721 event.
export const transferSingleEvent = transferEvent;
