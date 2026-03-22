"use client";

import { useEffect, useState, useCallback } from "react";
import { useWallet } from "@meshsdk/react";
import { UTxO, BlockfrostProvider, deserializeAddress } from "@meshsdk/core";
import { getProvider } from "@/lib/provider";
import { SCRIPT_ADDRESS, MICRO_USD_PER_USD, LOVELACE_PER_ADA } from "@/lib/contract";
import { lovelaceToAda, estimateVaultUsd, goalMicroUsdToUsd, DEMO_ADA_PRICE_USD } from "@/lib/transactions";
import PiggyIcon from "./PiggyIcon";
import CreateVaultPanel from "./CreateVaultPanel";
import DepositPanel from "./DepositPanel";
import WithdrawPanel from "./WithdrawPanel";

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (value / max) * 100);
  const met = pct >= 100;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-bark-light mb-1.5">
        <span>${value.toFixed(2)}</span>
        <span>${max.toFixed(2)} meta</span>
      </div>
      <div className="h-2 bg-clay-pale rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${met ? "bg-sage" : "bg-clay"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-bark-light mt-1 text-right">{pct.toFixed(1)}%</p>
    </div>
  );
}

export default function VaultDashboard() {
  const { connected, wallet } = useWallet();

  const [walletAda, setWalletAda] = useState<number | null>(null);
  const [vaultUtxo, setVaultUtxo] = useState<UTxO | null>(null);
  const [datum, setDatum] = useState<{ alternative: number; fields: unknown[] } | null>(null);
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [loading, setLoading] = useState(false);

  const fetchState = useCallback(async () => {
    if (!wallet || !connected) return;
    setLoading(true);
    try {
      // Wallet ADA balance
      const lovelaces = await wallet.getLovelace();
      setWalletAda(parseInt(lovelaces) / LOVELACE_PER_ADA);

      // Find vault UTxO owned by current wallet
      const addresses = await wallet.getUsedAddresses();
      const ownerAddr = addresses[0];
      const { pubKeyHash: ownerVkh } = deserializeAddress(ownerAddr);

      const provider = getProvider() as BlockfrostProvider;
      const scriptUtxos = await provider.fetchAddressUTxOs(SCRIPT_ADDRESS);

      const myUtxo = scriptUtxos.find((u) => {
        if (u.output.plutusData) {
          try {
            const d = JSON.parse(
              Buffer.from(u.output.plutusData, "hex").toString()
            );
            return d?.fields?.[1] === ownerVkh;
          } catch {
            // inline datum objects from Blockfrost come pre-parsed
          }
        }
        if (u.output.dataHash) return false;
        return false;
      });

      setVaultUtxo(myUtxo ?? null);
      if (myUtxo?.output.plutusData) {
        // Simplified datum parse for display
        setDatum({ alternative: 0, fields: [] });
      }
    } catch (err) {
      console.error("fetchState error:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet, connected]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (!connected) {
    return (
      <div className="flex flex-col items-center gap-6 py-8 animate-fade-in text-center">
        <p className="text-xs text-bark-light/70 tracking-wide uppercase font-semibold">
          Cardano · Pyth · Aiken
        </p>
        <PiggyIcon className="w-32 h-32 animate-wobble" />
        <div className="space-y-2 max-w-sm">
          <h1 className="font-display text-3xl text-bark leading-tight">
            Ahorra con reglas. <span className="text-clay">Sin excepciones.</span>
          </h1>
          <p className="text-bark-light text-sm leading-relaxed">
            Bóveda en preprod: el contrato libera fondos cuando el valor en USD alcanza tu meta
            (precio vía Pyth).
          </p>
        </div>
      </div>
    );
  }

  // Vault values from UTxO
  const vaultLovelace = vaultUtxo
    ? parseInt(
        vaultUtxo.output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0"
      )
    : 0;
  const vaultAda = lovelaceToAda(vaultLovelace);
  const vaultUsd = estimateVaultUsd(vaultLovelace);
  const goalUsd = datum ? goalMicroUsdToUsd(datum.fields[0] as number) : 0;
  const goalMet = goalUsd > 0 && vaultUsd >= goalUsd;

  return (
    <div className="w-full max-w-md mx-auto space-y-4 animate-fade-in">
      {/* Wallet balance bar */}
      <div className="flex items-center justify-between bg-warm border border-clay-pale rounded-2xl px-5 py-3">
        <div>
          <p className="text-xs font-semibold text-bark-light uppercase tracking-widest">Tu wallet</p>
          <p className="font-display text-2xl text-bark">
            ₳ {walletAda !== null ? walletAda.toFixed(2) : "…"}
          </p>
        </div>
        <button
          onClick={fetchState}
          disabled={loading}
          className="text-xs text-bark-light border border-clay-pale rounded-lg px-3 py-1.5 hover:bg-clay-pale transition-colors disabled:opacity-50"
        >
          {loading ? "…" : "↺ Actualizar"}
        </button>
      </div>

      {/* No vault */}
      {!vaultUtxo && (
        <CreateVaultPanel onCreated={fetchState} />
      )}

      {/* Vault found */}
      {vaultUtxo && (
        <div className="bg-warm border border-clay-pale rounded-2xl p-6 shadow-sm space-y-5 animate-slide-up">
          {/* Header */}
          <div className="flex items-center gap-4">
            <PiggyIcon className={`w-14 h-14 ${goalMet ? "animate-wobble" : "animate-pulse-soft"}`} />
            <div className="flex-1">
              <h2 className="font-display text-xl text-bark leading-tight">Tu Iron Pig</h2>
              <p className="text-sm text-bark-light">
                ₳ {vaultAda.toFixed(2)}{" "}
                <span className="text-bark-light/60">≈ ${vaultUsd.toFixed(2)}</span>
              </p>
            </div>
            <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
              goalMet
                ? "bg-sage-pale text-sage"
                : "bg-clay-pale text-clay"
            }`}>
              {goalMet ? "Desbloqueado" : "Bloqueado"}
            </span>
          </div>

          {/* Progress */}
          {goalUsd > 0 && (
            <ProgressBar value={vaultUsd} max={goalUsd} />
          )}

          {/* Price note */}
          <p className="text-xs text-bark-light/60 text-center">
            Precio ADA/USD demo: ${DEMO_ADA_PRICE_USD} · En producción usa el feed de Pyth
          </p>

          {/* Tabs */}
          <div className="flex bg-cream rounded-lg p-1 gap-1">
            {(["deposit", "withdraw"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 text-sm font-semibold py-2 rounded-md transition-colors ${
                  tab === t
                    ? "bg-white text-bark shadow-sm"
                    : "text-bark-light hover:text-bark"
                }`}
              >
                {t === "deposit" ? "Depositar" : "Retirar"}
              </button>
            ))}
          </div>

          {tab === "deposit" && datum && (
            <DepositPanel
              vaultUtxo={vaultUtxo}
              datum={datum}
              onDeposited={fetchState}
            />
          )}
          {tab === "withdraw" && datum && (
            <WithdrawPanel
              vaultUtxo={vaultUtxo}
              datum={datum}
              goalMet={goalMet}
              onWithdrawn={fetchState}
            />
          )}
        </div>
      )}
    </div>
  );
}
