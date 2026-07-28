/-!
ProofFrontier demo skeleton (no imports; plain Lean 4).

Demonstrates the three axes:
* kernel : each declaration receives its own successful node-probe record;
* source : `proved` / `sorry` / `axiom` from the text;
* trust  : PF-TRUST annotations + kernel-exact `collectAxioms` closures.
-/

-- PF-TRUST: library ref="Nat.add_comm, Lean core"
axiom add_comm_ext : ∀ a b : Nat, a + b = b + a

-- PF-TRUST: cited-external ref="Blueprint Thm 3.1 (survey, 2024)"
axiom cited_bound : ∀ n : Nat, n ≤ n + 1

-- PF-TRUST: conjectural ref="framework-specific hypothesis, unproven"
axiom magic_estimate : ∀ n : Nat, n * n ≤ n * n + n

-- An unannotated axiom must default to conjectural (conservative default).
axiom unannotated_ax : ∀ n : Nat, 0 ≤ n

def double (n : Nat) : Nat := n + n

theorem double_def (n : Nat) : double n = n + n := rfl

theorem pure_closed : 2 + 2 = 4 := rfl

theorem uses_library (a b : Nat) : a + b = b + a :=
  add_comm_ext a b

theorem uses_cited (n : Nat) : n ≤ n + 1 :=
  cited_bound n

theorem uses_conjecture (n : Nat) : n * n ≤ n * n + n :=
  magic_estimate n

theorem OPEN_MAIN_TASK (n : Nat) : double n ≤ n + n + 1 := by
  -- PF-SUBTASK: rewrite double n to n + n via double_def
  -- PF-SUBTASK: prove m ≤ m + 1 monotonicity step
  sorry

theorem FINAL_conditional (n : Nat) :
    double n ≤ n + n + 1 ∧ n ≤ n + 1 ∧ n * n ≤ n * n + n :=
  ⟨OPEN_MAIN_TASK n, uses_cited n, uses_conjecture n⟩
