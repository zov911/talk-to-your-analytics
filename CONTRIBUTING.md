# Contributing

## Branches

| Branch | Purpose | Rules |
|---|---|---|
| `main` | Released, stable. What `npx github:zov911/talk-to-your-analytics` installs | Only release merges from `develop`. Every merge is tagged `vX.Y.Z` |
| `develop` | Integration of finished work | Merge feature branches via PR; CI must pass |
| `feature/<name>` | One feature or fix | Branch from `develop`, PR back into `develop` |
| `hotfix/<name>` | Urgent fix for a release | Branch from `main`, PR into `main` and `develop` |

## Workflow

```bash
git checkout develop && git pull
git checkout -b feature/my-change
npm test
git commit -m "feat: add X"     # conventional commits: feat / fix / docs / refactor / test / chore
git push -u origin feature/my-change
gh pr create --base develop
```

Release: PR `develop` → `main`, bump `version` in `package.json` and `src/server.ts`, update `CHANGELOG.md`, tag `vX.Y.Z`.

## Checklist for a new tool

- [ ] Read-only annotations (`READ_ONLY`)
- [ ] Output is a compact markdown table, not raw JSON
- [ ] Works in demo mode, with a test in `test/server.test.ts`
- [ ] Documented in `docs/tools.md`
