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
  PYTH_POLICY_ID,
  ADA_USD_FEED_ID,
  LOVELACE_PER_ADA,
  MICRO_USD_PER_USD,
} from "./contract";

// ---------------------------------------------------------------------------
// 1. CREATE VAULT — pay ADA to script with inline IronPigDatum
//    No redeemer needed; script doesn't run on a simple payment.
// ---------------------------------------------------------------------------
export async function createVault(
  wallet: IWallet,
  goalUsd: number,
  adaAmount: number
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
  addUsdcx: number
): Promise<string> {
  const provider = getProvider();
  const addresses = await wallet.getUsedAddresses();
  const changeAddress = addresses[0];
  const utxos = await wallet.getUtxos();
  const collateral = await wallet.getCollateral();

  const currentLovelace = parseInt(
    vaultUtxo.output.amount.find((a) => a.unit === "lovelace")?.quantity ?? "0"
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
      SCRIPT_ADDRESS
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(REDEEMER_DEPOSIT, "Mesh", { mem: 3_500_000, steps: 1_000_000_000 })
    .txInScript(COMPILED_SCRIPT)
    .txOut(SCRIPT_ADDRESS, newOutput)
    .txOutInlineDatumValue(existingDatum)
    .changeAddress(changeAddress)
    .txInCollateral(
      collateral[0].input.txHash,
      collateral[0].input.outputIndex
    )
    .selectUtxosFrom(utxos)
    .complete();

  const signedTx = await wallet.signTx(unsignedTx);
  return wallet.submitTx(signedTx);
}

// ---------------------------------------------------------------------------
// 3. WITHDRAW — spend with Withdraw redeemer + Pyth reference input
//    NOTE: Pyth reference UTxO below is a demo placeholder.
//          Replace with the real preprod Pyth UTxO when available.
// ---------------------------------------------------------------------------
export async function withdraw(
  wallet: IWallet,
  vaultUtxo: UTxO,
  existingDatum: { alternative: number; fields: unknown[] },
  pythRefTxHash: string,
  pythRefTxIndex: number
): Promise<string> {
  const provider = getProvider();
  const addresses = await wallet.getUsedAddresses();
  const changeAddress = addresses[0];
  const utxos = await wallet.getUtxos();
  const collateral = await wallet.getCollateral();

  const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider, evaluator: provider });
  const unsignedTx = await txBuilder
    .spendingPlutusScriptV3()
    .txIn(
      vaultUtxo.input.txHash,
      vaultUtxo.input.outputIndex,
      vaultUtxo.output.amount,
      SCRIPT_ADDRESS
    )
    .txInInlineDatumPresent()
    .txInRedeemerValue(REDEEMER_WITHDRAW, "Mesh", { mem: 7_000_000, steps: 3_000_000_000 })
    .txInScript(COMPILED_SCRIPT)
    .readOnlyTxInReference(pythRefTxHash, pythRefTxIndex)
    .txOut(changeAddress, vaultUtxo.output.amount)
    .changeAddress(changeAddress)
    .txInCollateral(
      collateral[0].input.txHash,
      collateral[0].input.outputIndex
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

// Dummy ADA price for demo display (would come from Pyth in production)
export const DEMO_ADA_PRICE_USD = 0.45;

export function estimateVaultUsd(lovelace: number): number {
  return lovelaceToAda(lovelace) * DEMO_ADA_PRICE_USD;
}
