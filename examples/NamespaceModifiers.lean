namespace Alpha

theorem shared : True := by
  trivial

end Alpha

namespace Beta

-- PF-TRUST: cited-external ref="namespace/modifier probe"
axiom base : True

private theorem hidden : True := base

@[simp] protected theorem shared : True := hidden

theorem FINAL_namespace : True := Beta.shared

end Beta
