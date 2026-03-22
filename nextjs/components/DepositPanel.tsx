"use client";

import { useState } from "react";
import { useWallet } from "@meshsdk/react";
import { UTxO } from "@meshsdk/core";
import { deposit } from "@/lib/transactions";
import { LOVELACE_PER_ADA } from "@/lib/contract";

interface Props {
  vaultUtxo: UTxO;
  datum: { alternative: number; fields: unknown[] };
  onDeposited: () => void;
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;

  if (error && typeof error === "object") {
    const maybe = error as {
      message?: unknown;
      data?: { message?: unknown; error?: unknown };
      status?: unknown;
    };
    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;
    if (typeof maybe.data?.message === "string" && maybe.data.message.trim()) return maybe.data.message;
    if (typeof maybe.data?.error === "string" && maybe.data.error.trim()) return maybe.data.error;
    if (typeof maybe.status === "number") return `Request failed with status ${maybe.status}.`;
  }

  return "Deposit failed. Please try again and check wallet confirmation.";
}

export default function DepositPanel({ vaultUtxo, datum, onDeposited }: Props) {
  const { wallet } = useWallet();
  const [adaAmount, setAdaAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [txHash, setTxHash] = useState("");
  const [errMsg, setErrMsg] = useState("");

  async function handleDeposit() {
    if (!wallet) return;
    const ada = parseFloat(adaAmount);
    if (!ada || ada <= 0) {
      setStatus("err");
      setErrMsg("Enter a valid ADA amount.");
      return;
    }
    setStatus("loading");
    setErrMsg("");
    try {
      const lovelace = Math.floor(ada * LOVELACE_PER_ADA);
      const hash = await deposit(wallet, vaultUtxo, datum, lovelace, 0);
      if (!hash) {
        throw new Error("Transaction was built but no tx hash was returned by wallet.");
      }
      setTxHash(hash);
      setStatus("ok");
      setTimeout(onDeposited, 3000);
    } catch (e: unknown) {
      console.error("deposit error:", e);
      setErrMsg(extractErrorMessage(e));
      setStatus("err");
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-bark-light uppercase tracking-widest mb-1">
          Amount to add
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-bark-light">₳</span>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="5"
            value={adaAmount}
            onChange={(e) => setAdaAmount(e.target.value)}
            className="w-full bg-cream border border-clay-pale rounded-lg pl-7 pr-4 py-2.5 text-bark font-body focus:outline-none focus:ring-2 focus:ring-clay"
          />
        </div>
      </div>

      {status === "err" && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errMsg}</p>
      )}
      {status === "ok" && (
        <div className="bg-sage-pale rounded-lg px-3 py-2 text-sage text-sm">
          ✓ Deposit confirmed —{" "}
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
        onClick={handleDeposit}
        disabled={status === "loading"}
        className="w-full bg-clay hover:bg-clay-light disabled:opacity-60 transition-colors text-white font-semibold rounded-lg py-2.5 text-sm"
      >
        {status === "loading" ? "Sending…" : "Add ADA"}
      </button>
    </div>
  );
}
