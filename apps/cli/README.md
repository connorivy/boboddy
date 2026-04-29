# boboddy CLI

`boboddy` is a Bun + TypeScript CLI workspace with a modular command layout and compiled binary distribution support.

## Project Shape

```txt
apps/cli/
  src/
    index.ts
    commands/
      hello.ts
  script/
    build.ts
  bin/
    boboddy
  test/
    cli.test.ts
  package.json
  tsconfig.json
  README.md
```

## Prerequisites

- Bun `1.2.9` or newer

## Local Development

Install dependencies from the workspace root:

```sh
bun install
```

Run the CLI directly from source:

```sh
bun run apps/cli/src/index.ts hello
bun run apps/cli/src/index.ts hello Connor
```

Or from the package directory:

```sh
cd apps/cli
bun run src/index.ts hello Connor
```

## Type Checking

```sh
bun run --filter @boboddy/cli typecheck
```

## Tests

```sh
bun run --filter @boboddy/cli test
```

The tests spawn the CLI as a subprocess, so they do not require a global install.

## Build Binaries

```sh
bun run --filter @boboddy/cli build
```

This creates standalone binaries in `apps/cli/dist/` for:

- `boboddy-darwin-arm64`
- `boboddy-darwin-x64`
- `boboddy-linux-x64`
- `boboddy-linux-arm64`
- `boboddy-windows-x64.exe`

## npm Bin Wrapper

The package publishes the `boboddy` executable through `bin/boboddy`.

- The wrapper detects the current platform and architecture.
- It runs the matching compiled binary from `dist/` when available.
- It prints a clear error when the current platform is unsupported or the expected binary is missing.

After building, run the wrapper locally:

```sh
./bin/boboddy hello Connor
```

## npm-Style Installation

When this workspace is published as a package, the `bin` field maps the `boboddy` command to `./bin/boboddy`.

Typical install and usage shape:

```sh
npm install -g <published-package-name>
boboddy hello Connor
```

## Future GitHub Releases

For GitHub Releases, upload the compiled files from `apps/cli/dist/` as release assets. Consumers can then download the platform-specific binary directly without installing through npm.
