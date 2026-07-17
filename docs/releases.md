# Releases

Lush has one product version for the repository. Internal workspace packages
remain private implementation units and are not versioned or published
independently.

## Versioning policy

Lush follows Semantic Versioning with `vMAJOR.MINOR.PATCH` Git tags.

- Before `1.0.0`, incompatible changes increment `MINOR`. New backwards-
  compatible functionality also increments `MINOR`, and fixes increment
  `PATCH`.
- After `1.0.0`, incompatible changes increment `MAJOR`, backwards-compatible
  functionality increments `MINOR`, and fixes increment `PATCH`.
- A version covers the API, database migrations, browser app, and all other
  source in this repository as one tested release.
- The public `/v1beta` API may evolve incompatibly during the pre-1.0 period.
  Stable API surfaces need their own compatibility policy before promotion to
  `/v1`.

The root `package.json` is the source version. The workspace package versions
are deliberately not release coordinates.

Lush is distributed under the repository's Apache License 2.0.

## Release process

Release Please maintains one release pull request from Conventional Commit
messages on `main`:

- `fix:` proposes a patch release;
- `feat:` proposes a minor release;
- a `BREAKING CHANGE:` footer or `!` proposes an incompatible release;
- other commit types are included as appropriate but do not independently
  force a version bump.

Merging the release pull request updates `package.json` and `CHANGELOG.md`,
creates the matching `vMAJOR.MINOR.PATCH` tag, and publishes a GitHub Release.
The same workflow then publishes both OCI images for that exact tag.

Repository settings must allow GitHub Actions to create pull requests. Add a
fine-grained `RELEASE_PLEASE_TOKEN` Actions secret with repository Contents,
Issues, and Pull requests write access. Release Please needs this token so its
pull request triggers the normal test and image-build workflows; GitHub
suppresses workflows caused by pull requests created with the repository
`GITHUB_TOKEN`.

Image publication uses the repository-scoped `GITHUB_TOKEN`, so no registry
credential is required. Before publishing, the workflow confirms that the
requested immutable tag resolves to the checked-out commit and reruns the repo
checks and complete test suite against that exact source. Both pull-request CI
and release validation provision PostgreSQL and set `LUSH_TEST_DATABASE_URL`,
so database-backed auth and migration integration tests are part of the release
gate. Integration suites fail during discovery when `CI=true` and that dedicated
database URL is absent; they cannot silently degrade to skipped tests.

Before the first public release:

1. Add `RELEASE_PLEASE_TOKEN`, allow GitHub Actions to create pull requests,
   and require the test and image-build checks on the release pull request.
2. Confirm the two GHCR packages inherit public visibility from this public
   repository, or make them public after their first publication.

If image publication fails after the GitHub Release is created, rerun the
failed workflow jobs. The `Publish images` workflow also accepts the same
existing release tag as a manual recovery path. A release tag must never move
to another commit.

## Published artifacts

Each release publishes multi-platform `linux/amd64` and `linux/arm64` images:

- `ghcr.io/lush-agents/lush-api:<version>`
- `ghcr.io/lush-agents/lush-web:<version>`

Stable releases also update `latest`. Prereleases do not. Production and
managed deployments should pin an exact version or, preferably, the published
digest; `latest` is for evaluation only.

Every published image uses digest-pinned base images and has OCI source,
version, and revision metadata plus a GitHub/Sigstore build-provenance
attestation.

## Release scope

The release workflow publishes only artifacts that are real deployment units
today. The API currently embeds the agent runtime, so there is no standalone
`lush-agent` image. Add a separately versioned image only when that service is
actually split across a network boundary.
