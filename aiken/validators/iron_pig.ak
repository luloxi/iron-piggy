use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/interval.{Finite, Interval, before}
use cardano/address.{Script, from_script, from_verification_key}
use cardano/assets.{AssetName, PolicyId, Value, add, from_asset, from_lovelace}
use cardano/script_context.{ScriptContext}
use cardano/transaction.{
  InlineDatum, Input, NoDatum, Output, OutputReference, Transaction, find_input,
  find_script_outputs, placeholder,
}
use iron_pig_logic.{
  Deposit, IronPigDatum, PigRedeemer, PythOracleDatum, PythPriceEntry, Withdraw,
  find_pyth_update, lookup_feed, value_covers, value_paid_to, vault_total_micro_usd,
}

/// Max age (ms) between oracle `publish_time` and tx validity upper bound.
const max_oracle_age_ms: Int = 60_000

/// Vault: lock ADA + configured stables until Pyth-implied USD value ≥ goal.
///
/// Parameters: allow-listed stable `(PolicyId, AssetName)` pairs (1 unit = 1 micro-USD in this demo).
validator iron_pig(stable_assets: List<(PolicyId, AssetName)>) {
  spend(
    datum_opt: Option<IronPigDatum>,
    redeemer: PigRedeemer,
    utxo: OutputReference,
    self: Transaction,
  ) {
    expect Some(datum) = datum_opt
    expect Some(own_input) = find_input(self.inputs, utxo)
    expect Script(vault_hash) = own_input.output.address.payment_credential

    let vault_inputs =
      list.filter(
        self.inputs,
        fn(i) {
          i.output.address.payment_credential == Script(vault_hash)
        },
      )
    expect True = (list.length(vault_inputs) == 1)?

    when redeemer is {
      Deposit -> {
        let continuing = find_script_outputs(self.outputs, vault_hash)
        when continuing is {
          [out] -> {
            expect Script(out_hash) = out.address.payment_credential
            expect InlineDatum(datum_data) = out.datum
            expect continued: IronPigDatum = datum_data
            and {
              (out_hash == vault_hash)?,
              (continued == datum)?,
              value_covers(own_input.output.value, out.value)?,
              (out.value != own_input.output.value)?,
            }
          }
          _ -> False
        }
      }
      Withdraw ->
        if !list.has(self.extra_signatories, datum.owner) {
          False
        } else {
          expect Some(raw_oracle) =
            find_pyth_update(self.reference_inputs, datum.pyth_policy_id)
          expect oracle: PythOracleDatum = raw_oracle
          expect Some((m, e)) =
            lookup_feed(oracle.prices, datum.ada_usd_feed_id)
          let total =
            vault_total_micro_usd(own_input.output.value, stable_assets, m, e)
          let owner_addr = from_verification_key(datum.owner)
          let paid = value_paid_to(self.outputs, owner_addr)
          when self.validity_range.upper_bound.bound_type is {
            Finite(upper_ms) ->
              and {
                (upper_ms >= oracle.publish_time)?,
                (upper_ms - oracle.publish_time <= max_oracle_age_ms)?,
                (total >= datum.goal_micro_usd)?,
                (find_script_outputs(self.outputs, vault_hash) == [])?,
                value_covers(own_input.output.value, paid)?,
              }
            _ -> False
          }
        }
    }
  }

  else(_ctx: ScriptContext) {
    fail @"iron_pig only handles spend"
  }
}

// ## Tests (scenario-style using the real spend predicate)

const ada_feed: ByteArray = #"ada0ada0ada0ada0ada0ada0ada0ada0"

const pyth_pol: PolicyId =
  #"01010101010101010101010101010101010101010101010101010101"

const usdc_pol: PolicyId =
  #"02020202020202020202020202020202020202020202020202020202"

const usdc_name: AssetName = #"55534443"

const owner_vkh: VerificationKeyHash =
  #"03030303030303030303030303030303030303030303030303030303"

const vault_hash_dummy: PolicyId =
  #"04040404040404040404040404040404040404040404040404040404"

fn vault_datum(goal: Int) -> IronPigDatum {
  IronPigDatum {
    goal_micro_usd: goal,
    owner: owner_vkh,
    pyth_policy_id: pyth_pol,
    ada_usd_feed_id: ada_feed,
  }
}

fn stables() -> List<(PolicyId, AssetName)> {
  [(usdc_pol, usdc_name)]
}

fn pyth_ref_input(mantissa: Int, expo: Int, publish_time: Int) -> Input {
  Input {
    output_reference: OutputReference {
      transaction_id: #"1111111111111111111111111111111111111111111111111111111111111111",
      output_index: 99,
    },
    output: Output {
      address: from_verification_key(
        #"05050505050505050505050505050505050505050505050505050505",
      ),
      value: from_asset(pyth_pol, #"70797468", 1),
      datum: InlineDatum(
        PythOracleDatum {
          prices: [
            PythPriceEntry { feed_id: ada_feed, price_mantissa: mantissa, expo },
          ],
          publish_time,
        },
      ),
      reference_script: None,
    },
  }
}

/// Upper bound of tx validity (ms) for oracle freshness tests.
const test_oracle_publish_ms: Int = 1_700_000_000_000

fn fresh_validity_range() -> Interval {
  before(test_oracle_publish_ms + 30_000)
}

fn script_output(hash: PolicyId, value: Value, d: IronPigDatum) -> Output {
  Output {
    address: from_script(hash),
    value,
    datum: InlineDatum(d),
    reference_script: None,
  }
}

test deposit_preserves_datum_and_increases_value() {
  let goal = 1_000_000
  let datum = vault_datum(goal)
  let oref =
    OutputReference {
      transaction_id: #"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      output_index: 0,
    }
  let locked_in =
    from_lovelace(1_000_000)
      |> add(usdc_pol, usdc_name, 100_000)
  let locked_out =
    from_lovelace(5_000_000)
      |> add(usdc_pol, usdc_name, 200_000)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: oref,
          output: script_output(vault_hash_dummy, locked_in, datum),
        },
      ],
      outputs: [script_output(vault_hash_dummy, locked_out, datum)],
    }
  iron_pig.spend(stables(), Some(datum), Deposit, oref, tx)
}

test deposit_rejects_noop_same_value() fail {
  let goal = 1_000_000
  let datum = vault_datum(goal)
  let oref =
    OutputReference {
      transaction_id: #"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      output_index: 0,
    }
  let v = from_lovelace(1_000_000)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: oref,
          output: script_output(vault_hash_dummy, v, datum),
        },
      ],
      outputs: [script_output(vault_hash_dummy, v, datum)],
    }
  iron_pig.spend(stables(), Some(datum), Deposit, oref, tx)
}

test withdraw_fails_below_goal() fail {
  let goal = 10_000_000
  let datum = vault_datum(goal)
  // 2 ADA * $0.50/ADA = $1 + 500_000 micro stable = 1.5 USD < 10 USD goal
  let mantissa = 5
  let expo = -1
  let oref =
    OutputReference {
      transaction_id: #"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      output_index: 0,
    }
  let locked =
    from_lovelace(2_000_000)
      |> add(usdc_pol, usdc_name, 500_000)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: oref,
          output: script_output(vault_hash_dummy, locked, datum),
        },
      ],
      reference_inputs: [pyth_ref_input(mantissa, expo, test_oracle_publish_ms)],
      outputs: [
        Output {
          address: from_verification_key(owner_vkh),
          value: locked,
          datum: NoDatum,
          reference_script: None,
        },
      ],
      validity_range: fresh_validity_range(),
      extra_signatories: [owner_vkh],
    }
  iron_pig.spend(stables(), Some(datum), Withdraw, oref, tx)
}

test withdraw_fails_without_owner_signature() fail {
  let goal = 1
  let datum = vault_datum(goal)
  let mantissa = 2
  let expo = 0
  let oref =
    OutputReference {
      transaction_id: #"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      output_index: 0,
    }
  let locked = from_lovelace(1_000_000)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: oref,
          output: script_output(vault_hash_dummy, locked, datum),
        },
      ],
      reference_inputs: [pyth_ref_input(mantissa, expo, test_oracle_publish_ms)],
      outputs: [
        Output {
          address: from_verification_key(owner_vkh),
          value: locked,
          datum: NoDatum,
          reference_script: None,
        },
      ],
      validity_range: fresh_validity_range(),
      extra_signatories: [],
    }
  iron_pig.spend(stables(), Some(datum), Withdraw, oref, tx)
}

test withdraw_succeeds_when_value_covers_goal() {
  let goal = 1_000_000
  let datum = vault_datum(goal)
  // $2/ADA, 1 ADA + 0 stable = $2 >= $1 goal
  let mantissa = 2
  let expo = 0
  let oref =
    OutputReference {
      transaction_id: #"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      output_index: 0,
    }
  let locked = from_lovelace(1_000_000)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: oref,
          output: script_output(vault_hash_dummy, locked, datum),
        },
      ],
      reference_inputs: [pyth_ref_input(mantissa, expo, test_oracle_publish_ms)],
      outputs: [
        Output {
          address: from_verification_key(owner_vkh),
          value: locked,
          datum: NoDatum,
          reference_script: None,
        },
      ],
      validity_range: fresh_validity_range(),
      extra_signatories: [owner_vkh],
    }
  iron_pig.spend(stables(), Some(datum), Withdraw, oref, tx)
}

test withdraw_fails_when_oracle_too_stale() fail {
  let goal = 1_000_000
  let datum = vault_datum(goal)
  let mantissa = 2
  let expo = 0
  let oref =
    OutputReference {
      transaction_id: #"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      output_index: 0,
    }
  let locked = from_lovelace(1_000_000)
  let stale_range = before(test_oracle_publish_ms + max_oracle_age_ms + 1)
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: oref,
          output: script_output(vault_hash_dummy, locked, datum),
        },
      ],
      reference_inputs: [pyth_ref_input(mantissa, expo, test_oracle_publish_ms)],
      outputs: [
        Output {
          address: from_verification_key(owner_vkh),
          value: locked,
          datum: NoDatum,
          reference_script: None,
        },
      ],
      validity_range: stale_range,
      extra_signatories: [owner_vkh],
    }
  iron_pig.spend(stables(), Some(datum), Withdraw, oref, tx)
}

test withdraw_fails_when_not_paid_to_owner() fail {
  let goal = 1_000_000
  let datum = vault_datum(goal)
  let mantissa = 2
  let expo = 0
  let oref =
    OutputReference {
      transaction_id: #"abababababababababababababababababababababababababababababababab",
      output_index: 0,
    }
  let locked = from_lovelace(1_000_000)
  let attacker_vkh: VerificationKeyHash =
    #"06060606060606060606060606060606060606060606060606060606"
  let tx =
    Transaction {
      ..placeholder,
      inputs: [
        Input {
          output_reference: oref,
          output: script_output(vault_hash_dummy, locked, datum),
        },
      ],
      reference_inputs: [pyth_ref_input(mantissa, expo, test_oracle_publish_ms)],
      outputs: [
        Output {
          address: from_verification_key(attacker_vkh),
          value: locked,
          datum: NoDatum,
          reference_script: None,
        },
      ],
      validity_range: fresh_validity_range(),
      extra_signatories: [owner_vkh],
    }
  iron_pig.spend(stables(), Some(datum), Withdraw, oref, tx)
}
