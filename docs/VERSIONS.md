# Versions: what everyone must use

One page that says exactly which versions the project runs on, so every computer, every pull request and GitHub's automatic checks behave the same.

## The tools

| Tool | Version | Where it is enforced |
|---|---|---|
| Node.js | **24.20.0** | `.nvmrc` and `.node-version` (the file CI reads), and `engines` in `package.json` |
| npm | **11.4.2** (comes with Node 24.20.0) | `engines` and `packageManager` in `package.json` |
| PostgreSQL | **16** (Docker image `postgres:16`) | `docker-compose.yml` and `.github/workflows/ci.yml` |

`.npmrc` has `engine-strict=true`, so `npm install` stops with a clear message if your Node or npm is different.

## The packages (exact versions, from `package-lock.json`)

| Part | Package | Version |
|---|---|---|
| Web app | Next.js | 15.5.27 |
| Web app | React | 19.3.0 |
| Web app | Tailwind CSS | 4.3.3 |
| Web app | Radix UI (dialog) | 1.3.1 |
| Web app | Recharts (charts) | 3.10.1 |
| Web app | Lucide icons | 0.544.0 |
| API | NestJS | 11.2.7 |
| API | Swagger for Nest | 11.4.7 |
| API | Prisma (schema tool) | 6.19.3 |
| API | pg (PostgreSQL client) | 8.23.1 |
| API | Zod (settings checks) | 4.6.7 |
| API | RxJS | 7.8.2 |
| Both | TypeScript | 5.9.3 |
| Both | Type definitions for Node (@types/node) | 22.20.5 |
| Tools | ESLint | 9.39.5 |
| Tools | ts-node | 10.9.2 |

Every package in `apps/api/package.json`, `apps/web/package.json` and the root `package.json` names an exact version (no `^` or `~`), and `package-lock.json` pins everything underneath them.

## Setting up the same versions

```bash
# Windows: install nvm-windows (https://github.com/coreybutler/nvm-windows), then:
nvm install 24.20.0
nvm use 24.20.0
# macOS / Linux with nvm:  nvm install && nvm use      (reads .nvmrc)

node -v        # must print v24.20.0
npm -v         # must print 11.4.2
npm ci         # installs exactly what package-lock.json says (use this, not `npm install`)
```

Check a package inside the project folder, for example `npm ls next` (shows 15.x). Do not run `npx next --version` outside the project: `npx` downloads the newest Next.js, which is not the version this project uses.

## How a version changes

A version changes only through its own pull request, so the whole team moves together:
1. Create a branch such as `chore/upgrade-next`.
2. Change one thing: `npm install next@<exact version> -w apps/web` (or edit `.nvmrc` and `engines` for Node, then CI follows).
3. Update the table in this file, run `npm run check` and `npm test`, and commit `package-lock.json` with it.
4. Merge it, then everyone runs `git pull` and `npm ci` (and `nvm use` if Node changed).

GitHub's Dependabot opens weekly pull requests for newer versions. Merge them one at a time, and only when the checks pass.

## Known gaps

- `@types/node` is still on version 22 although Node is 24. It compiles fine; move it to 24 in a pull request of its own.
- GitHub's checks used Node 22 until now and switch to 24.20.0 with this change. The first push shows whether everything passes on Node 24.
