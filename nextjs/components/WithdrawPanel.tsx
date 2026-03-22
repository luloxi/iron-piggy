"use client";

import { useState } from "react";
import { useWallet } from "@meshsdk/react";
import { UTxO } from "@meshsdk/core";
import { withdraw } from "@/lib/transactions";
import { fetchSignedUpdate } from "@/lib/pyth";

interface Props {
  vaultUtxo: UTxO;
  datum: { alternative: number; fields: unknown[] };
  goalMet: boolean;
  onWithdrawn: () => void;
}

export default function WithdrawPanel({ vaultUtxo, datum, goalMet, onWithdrawn }: Props) {
  const { wallet } = useWallet();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [txHash, setTxHash] = useState("");
  const [errMsg, setErrMsg] = useState("");

  async function handleWithdraw() {
    if (!wallet) return;
    setStatus("loading");
    setErrMsg("");
    try {
      const signedUpdate = await fetchSignedUpdate();
      const hash = await withdraw(wallet, vaultUtxo, datum, signedUpdate);
      setTxHash(hash);
      setStatus("ok");
      setTimeout(onWithdrawn, 3500);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus("err");
    }
  }

  if (!goalMet) {
    return (
      <div className="rounded-lg bg-cream border border-clay-pale px-4 py-3 text-sm text-bark-light text-center">
        Your vault unlocks once its value reaches your goal.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-sage-pale border border-sage/20 px-4 py-3 text-sm text-sage font-semibold text-center">
        🎉 Goal reached — you can withdraw.
      </div>

      {status === "err" && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
      )}
      {status === "ok" && (
        <div className="bg-sage-pale rounded-lg px-3 py-2 text-sage text-sm">
          ✓ Withdrawal complete —{" "}
          <a
            href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            view tx
          </a>
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={status === "loading"}
        className="w-full bg-sage hover:bg-sage/80 disabled:opacity-60 transition-colors text-white font-semibold rounded-lg py-2.5 text-sm"
      >
        {status === "loading" ? "Processing…" : "Withdraw all"}
      </button>
    </div>
  );
}
