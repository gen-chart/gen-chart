# Security Policy

## Supported versions

Security fixes are provided for the latest minor release only.

| Version | Supported |
| --- | --- |
| 0.32.x | Yes |
| Earlier versions | No |

## Reporting a vulnerability

Please do not disclose vulnerabilities in a public issue. Use
[GitHub private vulnerability reporting](https://github.com/gen-chart/gen-chart/security/advisories/new)
and include:

- the affected version or commit;
- a minimal reproduction or proof of concept;
- the expected impact and affected data or permissions;
- any known workaround.

If the private form is unavailable, open a public issue containing only a
request for a private contact channel. Do not include vulnerability details,
credentials, customer data, or exploit code in that issue.

Maintainers aim to acknowledge a report within three business days and provide
an initial assessment within seven business days. Confirmed issues will be
handled in a private GitHub security advisory until a fix and disclosure are
ready.

## Scope

Reports may cover the agent instructions, CLI, validators, generated HTML/SVG,
browser-based preview and export paths, packaging, and release provenance.
Generated charts intentionally contain the data supplied to them; sharing an
artifact also shares its embedded data and CSV export.

## Release integrity

Official releases use an immutable `v<version>` tag and attach the deterministic
skill ZIP plus its SHA-256 checksum. Verify the checksum before manual
installation. The complete process is documented in [RELEASING.md](RELEASING.md).
