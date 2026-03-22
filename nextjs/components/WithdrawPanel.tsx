"use client";

import { useState } from "react";
import { useWallet } from "@meshsdk/react";
import { UTxO } from "@meshsdk/core";
import { withdraw } from "@/lib/transactions";

interface Props {
  vaultUtxo: UTxO;
  datum: { alternative: number; fields: unknown[] };
  goalMet: boolean;
  onWithdrawn: () => void;
}

// Preprod Pyth placeholder UTxO — replace when Pyth is live on preprod
const DEMO_PYTH_TX = "0000000000000000000000000000000000000000000000000000000000000001";
const DEMO_PYTH_IDX = 0;

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
      const hash = await withdraw(wallet, vaultUtxo, datum, DEMO_PYTH_TX, DEMO_PYTH_IDX);
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
        La bóveda se desbloquea cuando el valor alcance la meta.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-sage-pale border border-sage/20 px-4 py-3 text-sm text-sage font-semibold text-center">
        🎉 ¡Meta alcanzada! Puedes retirar.
      </div>

      {status === "err" && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
      )}
      {status === "ok" && (
        <div className="bg-sage-pale rounded-lg px-3 py-2 text-sage text-sm">
          ✓ Retiro exitoso —{" "}
          <a
            href={`https://preprod.cardanoscan.io/transaction/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold"
          >
            ver tx
          </a>
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={status === "loading"}
        className="w-full bg-sage hover:bg-sage/80 disabled:opacity-60 transition-colors text-white font-semibold rounded-lg py-2.5 text-sm"
      >
        {status === "loading" ? "Retirando…" : "Retirar fondos"}
      </button>
    </div>
  );
}
