# Security Policy

## Scope

OmniDash is an internal OmniNode platform tool. It is not a public service or published npm package. It runs on developer workstations in file mode and against the internal ONEX runtime on the platform network.

## Reporting a Vulnerability

If you discover a security issue in OmniDash, report it by opening a private issue in the GitHub repository or by contacting the OmniNode platform team directly.

Do not file public issues for security vulnerabilities.

## Supported Versions

Security fixes are applied to the `main` branch. There are no independently maintained release branches for older versions.

## Notes

- OmniDash in `VITE_DATA_SOURCE=file` mode reads only local fixture files. No network connections are made to external services.
- OmniDash in `VITE_DATA_SOURCE=http` mode connects to the ONEX Express bridge on the local port configured by the Express server. That bridge is a development-only server and is not exposed externally.
- Production deployments connect to the ONEX runtime on the internal platform network. The host and port are read from environment variables, not hardcoded in source.
- There are no hardcoded credentials or API keys in this repository. All runtime configuration comes from environment variables.
