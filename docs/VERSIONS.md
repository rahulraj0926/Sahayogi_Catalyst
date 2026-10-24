# Versions: what everyone must use

One page that says exactly which versions the project runs on, so every computer, every pull request and GitHub's automatic checks behave the same.

## The tools

<!-- versions:tools -->
| Tool | Version |
|---|---|
| Node.js | **24.20.0** |
| npm | **11.4.2** |
| PostgreSQL | **16** (Docker image `postgres:16`) |
<!-- /versions:tools -->

`.npmrc` has `engine-strict=true`, so `npm install` stops with a clear message if your Node or npm is different.

## The packages (exact versions)

These tables are written from `versions.json` by `npm run versions:sync`. Do not edit them by hand.

<!-- versions:packages -->
| Used in | Package | Version |
|---|---|---|
| Web app | @radix-ui/react-dialog | 1.3.1 |
| Web app | @radix-ui/react-dropdown-menu | 2.2.1 |
| Web app | @radix-ui/react-label | 2.1.17 |
| Web app | @radix-ui/react-slot | 1.5.0 |
| Web app | @tailwindcss/postcss | 4.3.3 |
| Web app | @types/react | 19.3.0 |
| Web app | @types/react-dom | 19.3.0 |
| Web app | class-variance-authority | 0.7.1 |
| Web app | clsx | 2.1.1 |
| Web app | lucide-react | 0.544.0 |
| Web app | next | 15.5.27 |
| Web app | react | 19.3.0 |
| Web app | react-dom | 19.3.0 |
| Web app | recharts | 3.10.1 |
| Web app | sonner | 2.0.8 |
| Web app | tailwind-merge | 3.7.0 |
| Web app | tailwindcss | 4.3.3 |
| Web app | tw-animate-css | 1.4.0 |
| API | @nestjs/cli | 11.0.24 |
| API | @nestjs/common | 11.2.7 |
| API | @nestjs/core | 11.2.7 |
| API | @nestjs/platform-express | 11.2.7 |
| API | @nestjs/swagger | 11.4.7 |
| API | @nestjs/throttler | 6.7.1 |
| API | @types/express | 5.0.6 |
| API | @types/pg | 8.23.1 |
| API | class-transformer | 0.5.1 |
| API | class-validator | 0.15.1 |
| API | helmet | 8.3.0 |
| API | pg | 8.23.1 |
| API | prisma | 6.19.3 |
| API | reflect-metadata | 0.2.2 |
| API | rxjs | 7.8.2 |
| API | ts-node | 10.9.2 |
| API | zod | 4.6.7 |
| Both | @types/node | 22.20.5 |
| Both | typescript | 5.9.3 |
| Tools | @eslint/js | 9.39.5 |
| Tools | eslint | 9.39.5 |
| Tools | eslint-plugin-react-hooks | 5.2.0 |
| Tools | typescript-eslint | 8.71.2 |
<!-- /versions:packages -->

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

## The catalog: one list, one command

`versions.json` is the single list of versions. Every `package.json`, `.nvmrc`, `.node-version`, the `engines` and `packageManager` lines, and the tables above are written from it, so a version can never be changed in one place and forgotten in another.

| Command | What it does |
|---|---|
| `npm run versions:check` | Fails if anything disagrees with the catalog: a `^` or `~` range, the same package at two versions in the API and the web app, a lock file that installs something else, a different Node in `.nvmrc`, the engines or the GitHub checks, a different Postgres image, or out-of-date tables here. GitHub runs it on every pull request, and `npm run check` runs it too. |
| `npm run versions:set -- next 15.6.0` | Changes one version everywhere: the catalog, every `package.json`, and these tables. Works for any package, and for `node`, `npm` and `postgres`. |
| `npm run versions:sync` | Writes the catalog into all the files again (use it after editing `versions.json` by hand). |
| `npm run versions:list` | Prints the catalog. |

## How a version changes

A version changes only through its own pull request, so the whole team moves together:
1. Create a branch such as `chore/upgrade-next`.
2. Run `npm run versions:set -- <package> <version>`. For Node, use `node` as the name, and install the new Node on your computer (`nvm install <version>`).
3. Run `npm install --package-lock-only` to update `package-lock.json`, then `npm run versions:check`, `npm run check` and `npm test`.
4. Commit everything it changed (`versions.json`, the `package.json` files, `package-lock.json`, this file) and open the pull request. If the new version breaks something, fix it in the same pull request.
5. After the merge, everyone runs `git pull` and `npm ci` (and `nvm use` if Node changed).

To add a brand-new package: `npm install <package>@<exact version> -w apps/web` (or `-w apps/api`), then add the same name and version to `versions.json` and run `npm run versions:sync`.

GitHub's Dependabot opens weekly pull requests for newer versions. Its pull request changes `package.json` but not the catalog, so the version check fails on purpose. On that branch, run `npm run versions:set -- <package> <the new version>`, commit the result, and the check passes. Merge Dependabot pull requests one at a time.

## Known gaps

- `@types/node` is still on version 22 although Node is 24. It compiles fine; move it to 24 in a pull request of its own.
- GitHub's checks used Node 22 until now and switch to 24.20.0 with this change. The first push shows whether everything passes on Node 24.
