module

import Lean.Elab.Frontend
import Lean.Util.FoldConsts
import Lean.Util.CollectAxioms

open Lean

namespace ProofFrontier.ProbeDriver

def protocolVersion := "prooffrontier-probe-v1"
def framePrefix := "PROOFFRONTIER_RESULT_V1|"

structure ProbeTarget where
  id : String
  probeName : String
deriving FromJson

structure ProbeRequest where
  protocol : String
  targets : Array ProbeTarget
  collectAxioms : Bool
deriving FromJson

structure ProbeDiagnostic where
  path : String
  line : Nat
  column : Nat
  severity : String
  message : String
deriving ToJson

structure ProbeNode where
  id : String
  probeName : String
  ok : Bool
  actualName : String
  directConstants : Array String
  axiomClosure : Array String
  error : String
deriving ToJson

structure ProbeReport where
  protocol : String := protocolVersion
  driverOk : Bool
  sourceOk : Bool
  environmentMode : String := "exact-source-frontend"
  diagnostics : Array ProbeDiagnostic
  nodes : Array ProbeNode
  error : String
deriving ToJson

def severityString : MessageSeverity → String
  | .information => "info"
  | .warning => "warning"
  | .error => "error"

def diagnosticsToJson (messages : MessageLog) : IO (Array ProbeDiagnostic) := do
  let mut result := #[]
  for msg in messages.reportedPlusUnreported do
    let serial ← msg.serialize
    result := result.push {
      path := serial.fileName
      line := serial.pos.line
      column := serial.pos.column
      severity := severityString serial.severity
      message := serial.data
    }
  return result

def resolveLocalName? (env : Environment) (probeName : String) : Option Name := do
  let userName := probeName.toName
  let candidates := #[userName, mkPrivateName env userName]
  for candidate in candidates do
    if (env.find? candidate).isSome && (env.getModuleIdxFor? candidate).isNone then
      if privateToUserName candidate == userName then
        return candidate
  none

def inspectNode
    (env : Environment)
    (inputCtx : Parser.InputContext)
    (collectClosure : Bool)
    (target : ProbeTarget) : IO ProbeNode := do
  let some actual := resolveLocalName? env target.probeName
    | return {
        id := target.id
        probeName := target.probeName
        ok := false
        actualName := ""
        directConstants := #[]
        axiomClosure := #[]
        error := "target was not created by this source"
      }
  let some info := env.find? actual
    | return {
        id := target.id
        probeName := target.probeName
        ok := false
        actualName := ""
        directConstants := #[]
        axiomClosure := #[]
        error := "target is absent from the final environment"
      }
  try
    let directConstants :=
      info.getUsedConstantsAsSet.toArray.map toString |>.qsort (· < ·)
    let axiomClosure ←
      if collectClosure then
        let coreCtx : Core.Context := {
          fileName := inputCtx.fileName
          fileMap := inputCtx.fileMap
        }
        let coreState : Core.State := { env }
        let action : Core.CoreM (Array Name) := collectAxioms actual
        let axioms ← Core.CoreM.toIO' action coreCtx coreState
        pure <| axioms.map toString
      else
        pure #[]
    return {
      id := target.id
      probeName := target.probeName
      ok := true
      actualName := toString actual
      directConstants
      axiomClosure
      error := ""
    }
  catch e =>
    return {
      id := target.id
      probeName := target.probeName
      ok := false
      actualName := toString actual
      directConstants := #[]
      axiomClosure := #[]
      error := toString e
    }

def elaborateExactSource
    (source : String)
    (fileName : String)
    (mainModuleName : Name) :
    IO (Option Environment × MessageLog) := do
  let inputCtx := Parser.mkInputContext source fileName
  let opts := Lean.internal.cmdlineSnapshots.setIfNotSet {} true
  let opts := Elab.async.setIfNotSet opts true
  let setup stx := do
    return .ok {
      imports := stx.imports
      isModule := stx.isModule
      mainModuleName
      opts
      trustLevel := 0
      plugins := #[]
    }
  let snap ← Language.Lean.process setup none { inputCtx with }
  let snapshots := Language.toSnapshotTree snap
  let messages :=
    snapshots.getAll.map (·.diagnostics.msgLog) |>.foldl (· ++ ·) {}
  let env? := (Language.Lean.waitForFinalCmdState? snap).map (·.env)
  return (env?, messages)

def emitReport (token : String) (report : ProbeReport) : IO Unit := do
  IO.println ""
  IO.println <| framePrefix ++ token ++ "|" ++ Json.compress (toJson report)

def validToken (token : String) : Bool :=
  token.length == 64 && token.all fun c => c.isDigit || ('a' ≤ c && c ≤ 'f')

def readRequest (path : System.FilePath) : IO ProbeRequest := do
  let raw ← IO.FS.readFile path
  let json ←
    match Json.parse raw with
    | .ok value => pure value
    | .error error => throw <| IO.userError s!"invalid request JSON: {error}"
  match fromJson? json with
  | .ok request => pure request
  | .error error => throw <| IO.userError s!"invalid probe request: {error}"

def runProbe
    (sourcePath : System.FilePath)
    (request : ProbeRequest) : IO ProbeReport := do
  if request.protocol != protocolVersion then
    return {
      driverOk := false
      sourceOk := false
      diagnostics := #[]
      nodes := #[]
      error := s!"unsupported protocol: {request.protocol}"
    }
  let source ← IO.FS.readFile sourcePath
  let fileName := sourcePath.toString
  let mainModuleName ←
    try moduleNameOfFileName sourcePath none
    catch _ => pure `_stdin
  let inputCtx := Parser.mkInputContext source fileName
  let (env?, messages) ← elaborateExactSource source fileName mainModuleName
  let diagnostics ← diagnosticsToJson messages
  let nodes ←
    match env? with
    | some env => request.targets.mapM <| inspectNode env inputCtx request.collectAxioms
    | none => pure <| request.targets.map fun target => {
        id := target.id
        probeName := target.probeName
        ok := false
        actualName := ""
        directConstants := #[]
        axiomClosure := #[]
        error := "Lean could not construct a final command environment"
      }
  return {
    driverOk := env?.isSome
    sourceOk := env?.isSome && !messages.hasErrors
    diagnostics
    nodes
    error := if env?.isSome then "" else "frontend did not produce a final environment"
  }

unsafe def main (args : List String) : IO Unit := do
  enableInitializersExecution
  let token := (← (← IO.getStdin).getLine).trimAscii.toString
  unless validToken token do
    throw <| IO.userError "missing or invalid result-channel token"
  let [sourceArg, requestArg] := args
    | emitReport token {
        driverOk := false
        sourceOk := false
        diagnostics := #[]
        nodes := #[]
        error := "expected source and request paths"
      }
      return
  if sourceArg.isEmpty || requestArg.isEmpty then
    emitReport token {
      driverOk := false
      sourceOk := false
      diagnostics := #[]
      nodes := #[]
      error := "expected source and request paths"
    }
    return
  try
    let sourcePath : System.FilePath := sourceArg
    let requestPath : System.FilePath := requestArg
    let request ← readRequest requestPath
    emitReport token (← runProbe sourcePath request)
  catch e =>
    emitReport token {
      driverOk := false
      sourceOk := false
      diagnostics := #[]
      nodes := #[]
      error := toString e
    }

end ProofFrontier.ProbeDriver

public unsafe def main (args : List String) : IO Unit :=
  ProofFrontier.ProbeDriver.main args
