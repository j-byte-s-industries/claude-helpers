---
name: release
description: Cut a release of a plugin/mod/app repo: confirm the repo, bump version, run checks, tag, open PR via gh. Use for /release.
---

# Release

1. Confirm target: `git remote -v` and `git status`. State repo + branch to the user; stop if it does not match the project discussed.
2. Run the project's checks (`npm run check`, `npm test`, or equivalent). Do not continue on failure.
3. Bump version in manifest/package files and changelog. Show the diff.
4. Commit on a branch, push, open PR with `gh pr create`. Check CI with `gh pr checks <PR#>` (poll cap 10 min).
5. After merge and user OK: `git tag vX.Y.Z && git push --tags`, then `gh release create`.
6. Report: version, PR link, CI result, release URL.
