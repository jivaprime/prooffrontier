"""ProofFrontier: three-axis (kernel/source/trust) proof-skeleton auditor."""

__version__ = "0.1.0"
from .analyze import analyze
from .model import Decl, Kernel, Source, Trust
from .parser import parse

__all__ = ["analyze", "parse", "Decl", "Kernel", "Source", "Trust"]
