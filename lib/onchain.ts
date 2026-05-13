import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

export const NORMIES_CONTRACT = "0x9435208ca4a8dfba4bbffc52bd4d65fac3a87fd4" as const;

const ALCHEMY = process.env.ALCHEMY_API_KEY
  ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
  : null;
const PUBLIC_RPC = "https://eth.llamarpc.com";

export const ethClient = createPublicClient({
  chain: mainnet,
  transport: http(ALCHEMY ?? PUBLIC_RPC, { batch: true }),
});

export const transferSingleEvent = {
  type: "event",
  name: "TransferSingle",
  inputs: [
    { name: "operator", type: "address", indexed: true },
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "id", type: "uint256", indexed: false },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const;
