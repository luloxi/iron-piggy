import {
  MeshTxBuilder,
  IWallet,
  UTxO,
  deserializeAddress,
} from "@meshsdk/core";
import { getProvider } from "./provider";
import {
  SCRIPT_ADDRESS,
  COMPILED_SCRIPT,
  buildIronPigDatum,
  REDEEMER_DEPOSIT,
  REDEEMER_WITHDRAW,
  LOVELACE_PER_ADA,
  MICRO_USD_PER_USD,
} from "./contract";
import {
  PYTH_STATE_TX_HASH,
  PYTH_STATE_TX_INDEX,
  PYTH_SCRIPT_REF_TX_HASH,
  PYTH_SCRIPT_REF_TX_INDEX,
  PYTH_WITHDRAW_SCRIPT_HASH,
  pythRewardAddress,
  buildPythRedeemer,
} from "./pyth";

// ---------------------------------------------------------------------------
// 1. CREATE VAULT — pay ADA to script with inline IronPigDatum
// ---------------------------------------------------------------------------
export async function createVault(
  wallet: IWallet,
  goalUsd: number,
  adaAmount: number,
): Promise<string> {
  const provider = getProvider();
  const addresses = await wallet.getUsedAddresses();
  const changeAddress = addresses[0];
  const utxos = await wallet.getUtxos();

  const { pubKeyHash: ownerVkh } = deserializeAddress(changeAddress);
  const datum = buildIronPigDatum(goalUsd, ownerVkh);
  const lovelace = (adaAmount * LOVELACE_PER_ADA).toString();

  const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });
  const unsignedTx = await txBuilder
    .txOut(SCRIPT_ADDRESS, [{ unit: "lovelace", quantity: lovelace }])
    .txOutInlineDatumValue(datum)
    .changeAddress(changeAddress)
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ---------------------------------------------------------------------------
// 2. DEPOSIT — spend existing vault UTxO and re-lock with more ADA / tokens
// ---------------------------------------------------------------------------
export async function deposit(
  wallet: IWallet,
  vaultUtxo: UTxO,
  existingDatum: { alternative: number; fields: unknown[] },
  addLovelace: number,
  addUsdcx: number,
): Promise<string> {
  const provider = getProvider();
  const addresses = await wallet.getUsedAddresses();
  const changeAddress = addresses[0];
  const utxos = await wallet.getUtxos();
  const collateral = await wallet.getCollateral();

  const currentLovelace = parseInt(
    vaultUtxo.output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0",
  );
  const newLovelace = (currentLovelace + addLovelace).toString();
  const newOutput: { unit: string; quantity: string }[] = [
    { unit: "lovelace", quantity: newLovelace },
  ];

  const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider, evaluator: provider });
  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(
      vaultUtxo.input.txHash,
      vaultUtxo.input.outputIndex,
      vaultUtxo.output.amount,
      SCRIPT_ADDRESS,
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(REDEEMER_DEPOSIT, "Mesh", { mem: 3_500_000, steps: 1_000_000_000 })
    .txInScript(COMPILED_SCRIPT)
    .txOut(SCRIPT_ADDRESS, newOutput)
    .txOutInlineDatumValue(existingDatum)
    .changeAddress(changeAddress)
    .txInCollateral(
      collateral[0].input.txHash,
      collateral[0].input.outputIndex,
    )
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ---------------------------------------------------------------------------
// 3. WITHDRAW — Pyth Lazer verified price + vault spend in a single tx.
//
//    Shape:
//      - Spend vault UTxO with Withdraw redeemer
//      - Read-only ref input: Pyth State NFT
//      - 0-withdrawal from Pyth withdraw script with [signedUpdate] redeemer
//      - Short validity window aligned with oracle freshness
// ---------------------------------------------------------------------------
export async function withdraw(
  wallet: IWallet,
  vaultUtxo: UTxO,
  existingDatum: { alternative: number; fields: unknown[] },
  signedUpdateHex: string,
): Promise<string> {
  const provider = getProvider();
  const addresses = await wallet.getUsedAddresses();
  const changeAddress = addresses[0];
  const utxos = await wallet.getUtxos();
  const collateral = await wallet.getCollateral();

  const pythReward = pythRewardAddress(0);
  const pythRedeemer = buildPythRedeemer(signedUpdateHex);

  const nowMs = Date.now();
  const slotOffset = 4_924_800;
  const nowSlot = Math.floor((nowMs / 1000) - 1_596_491_091) + slotOffset;

  const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider, evaluator: provider });
  const unsignedTx = await txBuilder
    // Vault spend
    .spendingPlutusScriptV3()
    .txIn(
      vaultUtxo.input.txHash,
      vaultUtxo.input.outputIndex,
      vaultUtxo.output.amount,
      SCRIPT_ADDRESS,
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(REDEEMER_WITHDRAW, "Mesh", { mem: 14_000_000, steps: 5_000_000_000 })
    .txInScript(COMPILED_SCRIPT)
    // Pyth state as read-only reference
    .readOnlyTxInReference(PYTH_STATE_TX_HASH, PYTH_STATE_TX_INDEX)
    // Pyth 0-withdrawal with signed update as redeemer
    .withdrawalPlutusScriptV3()
    .withdrawal(pythReward, "0")
    .withdrawalTxInReference(
      PYTH_SCRIPT_REF_TX_HASH,
      PYTH_SCRIPT_REF_TX_INDEX,
      undefined,
      PYTH_WITHDRAW_SCRIPT_HASH,
    )
    .withdrawalRedeemerValue(pythRedeemer, "Mesh", { mem: 14_000_000, steps: 10_000_000_000 })
    // Vault value to owner
    .txOut(changeAddress, vaultUtxo.output.amount)
    // Validity window (~2 min)
    .invalidBefore(nowSlot - 60)
    .invalidHereafter(nowSlot + 60)
    .changeAddress(changeAddress)
    .txInCollateral(
      collateral[0].input.txHash,
      collateral[0].input.outputIndex,
    )
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx, true);
  return wallet.submitTx(signedTx);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
export function lovelaceToAda(lovelace: number): number {
  return lovelace / LOVELACE_PER_ADA;
}

export function goalMicroUsdToUsd(microUsd: number): number {
  return microUsd / MICRO_USD_PER_USD;
}

export const DEMO_ADA_PRICE_USD = 0.45;

export function estimateVaultUsd(lovelace: number): number {
  return lovelaceToAda(lovelace) * DEMO_ADA_PRICE_USD;
}
