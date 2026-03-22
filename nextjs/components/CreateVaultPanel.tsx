"use client";

import { useState } from "react";
import { useWallet } from "@meshsdk/react";
import { createVault } from "@/lib/transactions";

interface Props {
  onCreated: () => void;
}

export default function CreateVaultPanel({ onCreated }: Props) {
  const { wallet } = useWallet();
  const [goalUsd, setGoalUsd] = useState("");
  const [adaAmount, setAdaAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [txHash, setTxHash] = useState("");
  const [errMsg, setErrMsg] = useState("");

  async function handleCreate() {
    if (!wallet) return;
    const goal = parseFloat(goalUsd);
    const ada = parseFloat(adaAmount);
    if (!goal || !ada || ada < 2) {
      setErrMsg("Mínimo 2 ADA para cubrir el depósito mínimo de Cardano.");
      setStatus("err");
      return;
    }
    setStatus("loading");
    setErrMsg("");
    try {
      const hash = await createVault(wallet, goal, ada);
      setTxHash(hash);
      setStatus("ok");
      setTimeout(onCreated, 3000);
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setStatus("err");
    }
  }

  return (
    <div className="bg-warm border border-clay-pale rounded-2xl p-6 shadow-sm animate-slide-up">
      <h2 className="font-display text-xl text-bark mb-1">Crear tu Iron Pig</h2>
      <p className="text-bark-light text-sm mb-5">
        Fija una meta en USD y deposita tus primeros ADA.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-bark-light uppercase tracking-widest mb-1">
            Meta en USD
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bark-light font-body">$</span>
            <input
              type="number"
              min="1"
              placeholder="100"
              value={goalUsd}
              onChange={(e) => setGoalUsd(e.target.value)}
              className="w-full bg-cream border border-clay-pale rounded-lg pl-7 pr-4 py-2.5 text-bark font-body focus:outline-none focus:ring-2 focus:ring-clay focus:border-transparent"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-bark-light uppercase tracking-widest mb-1">
            ADA inicial
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bark-light font-body">₳</span>
            <input
              type="number"
              min="2"
              step="1"
              placeholder="10"
              value={adaAmount}
              onChange={(e) => setAdaAmount(e.target.value)}
              className="w-full bg-cream border border-clay-pale rounded-lg pl-7 pr-4 py-2.5 text-bark font-body focus:outline-none focus:ring-2 focus:ring-clay focus:border-transparent"
            />
          </div>
        </div>

        {status === "err" && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
        )}
        {status === "ok" && (
          <div className="bg-sage-pale rounded-lg px-3 py-2 text-sage text-sm">
            ✓ Vault creado —{" "}
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
          onClick={handleCreate}
          disabled={status === "loading"}
          className="w-full bg-clay hover:bg-clay-light disabled:opacity-60 transition-colors text-white font-semibold rounded-lg py-2.5 text-sm"
        >
          {status === "loading" ? "Creando…" : "Crear bóveda"}
        </button>
      </div>
    </div>
  );
}
