# Local request failure diagnosis

Checked on 29 October 2026.

The reported message came from an ORION GitHub repository request that Octokit
wrapped as HTTP 500. Anonymous native fetch and curl later reproduced refused
HTTPS connections to `api.github.com`, `github.com` and all four resolved
`raw.githubusercontent.com` addresses. This is an outbound connection failure,
not evidence that the comic directory is unwritable. An actual private file
write, atomic rename and cleanup succeeded in `apps/web/.comic-code`.

The connection temporarily recovered: the running API inspected ORION at
`4be39c98cb1214c865bc79405b7612bca05f3e98`, selecting 40 of 243 files. Subsequent
live generation attempts failed when GitHub connections were refused again.
No completed live twelve-panel generation is claimed by this fix.

Changes:

- GitHub REST and immutable raw-source GETs retry one connection failure or
  temporary 500/502/503/504 after 250 ms. A shared 20-second deadline bounds both
  attempts and the response stream. Auth, missing data, quota errors, canceled
  operations and mutations are not retried.
- Upstream failures, timeouts and broken source streams return
  `github_unavailable` (503). The web and extension explain the connection issue.
- Disk permission, read-only filesystem and disk-full failures return
  `local_storage_unavailable` (507), with storage-specific recovery advice.
- Unknown errors retain a generic local error; upstream bodies, credentials and
  filesystem paths are not returned to the browser.

Verification:

- New regression tests failed before the implementation and passed afterward.
- `pnpm check` passed 113 tests, lint, formatting, web/extension production builds
  and all seven workspace typechecks. The optional live GitHub test is skipped.
- The rebuilt browser displays the GitHub-specific error for a real outage.
- Local saved comics and illustrative samples remain available independently of
  GitHub. Live source generation and GitHub push still require the external
  connection to recover. Retrying cannot repair a persistent refused connection.
