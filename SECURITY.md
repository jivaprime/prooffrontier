# Security policy

## Threat model

ProofFrontier is a local developer tool. Verifying Lean source invokes the local
Lean executable. Lean elaboration can run metaprograms, tactics, plugins, and
IO, so untrusted source must be treated as executable code.

## Safe use

- Keep the server bound to its default `127.0.0.1`.
- Verify only source and Lake workspaces you trust.
- Do not publish port `8766` through a proxy, tunnel, or container port.
- Use an OS/container sandbox if untrusted source must be inspected.
- Treat generated DOT/JSON reports as potentially sensitive project metadata.

The server rejects non-JSON API requests and mismatched Host/Origin values.
Non-loopback binding requires `--allow-remote`, but that flag does not provide
authentication or process isolation.

ProofFrontier authenticates the driver result channel with a per-run token consumed
before source elaboration. This prevents source stdout and early process exit
from forging checked nodes. It does not sandbox tactics, plugins, native code,
filesystem access, or other effects available to the Lean process.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting or a private repository security
advisory when available. Otherwise contact the repository maintainer through
their GitHub profile before publishing exploit details. Include the affected
version, reproduction steps, and practical impact.

Please do not use a public issue for an unpatched remote-code-execution or
local-file-disclosure report.
