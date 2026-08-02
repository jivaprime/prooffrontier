/-!
ProofFrontier collaborative research sample.

The target is a local-to-global counting estimate. The file deliberately
contains four different kinds of research evidence:

* closed Lean proofs for the elementary setup;
* an established project-library contract;
* a cited external estimate;
* a new conjectural hypothesis;
* one named proof obligation that is still open.

The final declaration is accepted by Lean, but ProofFrontier must display it
as conditional because both the conjecture and the open task reach it.
-/

-- PF-TRUST: library ref="Project.Model decomposition interface"
axiom decomposition_contract
    (structured boundary total : Nat -> Nat) (n : Nat) :
    total n = structured n + boundary n

-- PF-TRUST: cited-external ref="Illustrative local estimate, Theorem 2.4"
axiom published_local_estimate
    (structured : Nat -> Nat) (n : Nat) :
    Nat.le (structured n) (2 * n)

-- PF-TRUST: conjectural ref="uniform overlap bound; open research hypothesis"
axiom uniform_overlap_hypothesis
    (overlap : Nat -> Nat) (n : Nat) :
    Nat.le (overlap n) n

theorem index_reflexive (n : Nat) : n = n := rfl

theorem normalization_zero (n : Nat) : n + 0 = n :=
  Nat.add_zero n

theorem decomposition_step
    (structured boundary total : Nat -> Nat) (n : Nat) :
    total n = structured n + boundary n :=
  decomposition_contract structured boundary total n

theorem local_estimate_branch
    (structured : Nat -> Nat) (n : Nat) :
    Nat.le (structured n) (2 * n) :=
  published_local_estimate structured n

theorem overlap_branch
    (overlap : Nat -> Nat) (n : Nat) :
    Nat.le (overlap n) n :=
  uniform_overlap_hypothesis overlap n

theorem setup_certificate (n : Nat) :
    And (n = n) (n + 0 = n) :=
  And.intro (index_reflexive n) (normalization_zero n)

theorem OPEN_BOUNDARY_DECAY_TASK
    (boundary : Nat -> Nat) (n : Nat) :
    Nat.le (boundary n) n := by
  -- PF-SUBTASK: derive a scale-uniform boundary estimate
  -- PF-SUBTASK: remove dependence on the finite truncation parameter
  -- PF-SUBTASK: document the constants needed by the global step
  sorry

theorem global_counting_bound
    (structured boundary total : Nat -> Nat) (n : Nat) :
    Nat.le (total n) (2 * n + n) := by
  rw [decomposition_step structured boundary total n]
  exact Nat.add_le_add
    (local_estimate_branch structured n)
    (OPEN_BOUNDARY_DECAY_TASK boundary n)

theorem stability_certificate
    (structured overlap : Nat -> Nat) (n : Nat) :
    And (Nat.le (overlap n) n) (Nat.le (structured n) (2 * n)) :=
  And.intro
    (overlap_branch overlap n)
    (local_estimate_branch structured n)

theorem FINAL_conditional_estimate
    (structured boundary total overlap : Nat -> Nat) (n : Nat) :
    And
      (Nat.le (total n) (2 * n + n))
      (And (Nat.le (overlap n) n) (n + 0 = n)) := by
  have stability := stability_certificate structured overlap n
  have setup := setup_certificate n
  exact And.intro
    (global_counting_bound structured boundary total n)
    (And.intro stability.left setup.right)
