//// Iron Pig — shared types & valuation helpers for the vault validator.
//// (Module name avoids clashing with `validators/iron_pig.ak`.)
////
//// ## Units
//// - **micro-USD**: 1 USD = 1_000_000 micro-USD (fixed-point, off-chain convention).
//// - **Stablecoins**: each ledger unit of a configured `(PolicyId, AssetName)` counts as **1 micro-USD**
////   (demo simplification; map decimals off-chain for real USDC/iUSD).
//// - **ADA / Pyth**: uses Pyth-style `(price_mantissa, expo)` for the ADA/USD feed. On-chain we compute:
////   `micro_usd_for_ada = lovelace * mantissa * 10^expo` (integer math; negative `expo` divides).

use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address}
use cardano/assets.{
  AssetName, PolicyId, Value, ada_asset_name, ada_policy_id, flatten,
  merge, quantity_of, tokens, zero,
}
use cardano/transaction.{InlineDatum, Input, Output}

/// Vault rules (set at lock time, preserved on every `Deposit`).
pub type IronPigDatum {
  /// Target portfolio value in micro-USD.
  goal_micro_usd: Int,
  /// Only this key hash may sign `Withdraw` once the goal is met.
  owner: VerificationKeyHash,
  /// Any positive quantity under this policy on the Pyth reference UTxO authenticates the batch.
  pyth_policy_id: PolicyId,
  /// 32-byte Pyth price feed id (hex in docs; here: raw bytes).
  ada_usd_feed_id: ByteArray,
}

pub type PigRedeemer {
  Deposit
  Withdraw
}

/// Simplified on-chain mirror of a Pyth price batch (see README — align with preprod Pyth layout).
pub type PythPriceEntry {
  feed_id: ByteArray,
  price_mantissa: Int,
  expo: Int,
}

pub type PythOracleDatum {
  prices: List<PythPriceEntry>,
  /// POSIX milliseconds when this batch was published (staleness vs tx validity).
  publish_time: Int,
}

/// 10^e for small non-negative e (sufficient for typical Pyth exponents).
fn pow10_pos(e: Int) -> Int {
  if e <= 0 {
    1
  } else {
    10 * pow10_pos(e - 1)
  }
}

/// Micro-USD contributed by locked ADA given Pyth mantissa + expo (ADA/USD feed).
pub fn ada_value_micro_usd(lovelace: Int, mantissa: Int, expo: Int) -> Int {
  let n = lovelace * mantissa
  if expo >= 0 {
    n * pow10_pos(expo)
  } else {
    n / pow10_pos(-expo)
  }
}

pub fn lookup_feed(
  prices: List<PythPriceEntry>,
  feed_id: ByteArray,
) -> Option<(Int, Int)> {
  list.find_map(
    prices,
    fn(e) {
      if e.feed_id == feed_id {
        Some((e.price_mantissa, e.expo))
      } else {
        None
      }
    },
  )
}

/// Sum configured stable balances; **1 token unit == 1 micro-USD** (demo).
pub fn stable_micro_usd(
  value: Value,
  stables: List<(PolicyId, AssetName)>,
) -> Int {
  list.foldr(
    stables,
    0,
    fn(pair, acc) {
      let (p, n) = pair
      acc + quantity_of(value, p, n)
    },
  )
}

pub fn vault_total_micro_usd(
  value: Value,
  stables: List<(PolicyId, AssetName)>,
  ada_mantissa: Int,
  ada_expo: Int,
) -> Int {
  let ada_qty = quantity_of(value, ada_policy_id, ada_asset_name)
  let ada_part = ada_value_micro_usd(ada_qty, ada_mantissa, ada_expo)
  let stable_part = stable_micro_usd(value, stables)
  ada_part + stable_part
}

/// Every asset present in `inner` must appear in `outer` with **greater-or-equal** quantity.
pub fn value_covers(inner: Value, outer: Value) -> Bool {
  flatten(inner)
    |> list.all(
        fn(triple) {
          let (p, n, q) = triple
          quantity_of(outer, p, n) >= q
        },
      )
}

/// Sum of `value` on all outputs paid to `recipient` (same address equality).
pub fn value_paid_to(outputs: List<Output>, recipient: Address) -> Value {
  list.foldr(
    outputs,
    zero,
    fn(o, acc) {
      if o.address == recipient {
        merge(acc, o.value)
      } else {
        acc
      }
    },
  )
}

/// First reference input that carries any token under `pyth_policy` and an inline oracle datum.
pub fn find_pyth_update(
  reference_inputs: List<Input>,
  pyth_policy: PolicyId,
) -> Option<Data> {
  list.find_map(
    reference_inputs,
    fn(inp) {
      let v = inp.output.value
      if dict.is_empty(tokens(v, pyth_policy)) {
        None
      } else {
        when inp.output.datum is {
          InlineDatum(d) -> Some(d)
          _ -> None
        }
      }
    },
  )
}
