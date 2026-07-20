# Changelog

## [0.1.1](https://github.com/lush-agents/lush/compare/v0.1.0...v0.1.1) (2026-07-20)


### Bug Fixes

* **notifications:** use Bun-compatible SMTP client ([#82](https://github.com/lush-agents/lush/issues/82)) ([30d635f](https://github.com/lush-agents/lush/commit/30d635f6a681730ee925fdf3cf6f915591c63df5))

## 0.1.0 (2026-07-18)


### ⚠ BREAKING CHANGES

* **web:** lush-web no longer proxies /health or /v1beta paths. Same-origin deployments must route those paths directly to lush-api at ingress; LUSH_API_UPSTREAM and LUSH_EXTERNAL_SCHEME are removed from the web-image contract.

### Features

* **release:** publish signed static web distribution ([#75](https://github.com/lush-agents/lush/issues/75)) ([1084819](https://github.com/lush-agents/lush/commit/1084819cb6f382c8c9124d7f4c529a4512d55401))
* **release:** publish versioned container images ([#46](https://github.com/lush-agents/lush/issues/46)) ([0137f0d](https://github.com/lush-agents/lush/commit/0137f0d82b618486ab08458a0618ed093105dd51))
* **web:** make lush-web a topology-neutral static origin ([#74](https://github.com/lush-agents/lush/issues/74)) ([5c0810d](https://github.com/lush-agents/lush/commit/5c0810d15f3df0bc8142b876a8fb00a2030244a0))


### Performance Improvements

* **code:** append session events incrementally ([#76](https://github.com/lush-agents/lush/issues/76)) ([c652546](https://github.com/lush-agents/lush/commit/c6525465437c1e50256a0ed403bd2a3350f106a9)), closes [#20](https://github.com/lush-agents/lush/issues/20)
