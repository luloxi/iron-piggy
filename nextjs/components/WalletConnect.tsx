"use client";

import { CardanoWallet, useWallet } from "@meshsdk/react";
import { getProvider } from "@/lib/provider";

export default function WalletConnect() {
  const { connected } = useWallet();
  const provider = getProvider();

  return (
    <div className="flex items-center">
      <div className={connected ? "[&_button]:!bg-sage" : "[&_button]:!bg-clay"}>
        <CardanoWallet
          label={connected ? "Connected" : "Connect Wallet"}
          persist
          burnerWallet={{ networkId: 0, provider: provider as never }}
        />
      </div>
    </div>
  );
}
