## [0.8.0](https://github.com/Mondarth/EMMA/compare/v0.7.0...v0.8.0) (2026-10-27)

### Features

* **ui:** leave unavailable modules out, naming them in every report ([934b780](https://github.com/Mondarth/EMMA/commit/934b780cc57a5936b8046fb83389e4325f595a55))
* **ui:** let GMs choose how many older versions to show ([4e9aa3c](https://github.com/Mondarth/EMMA/commit/4e9aa3c32b6e2f8e9b0b87ae3b5daf872c1f6c92)), closes [#38](https://github.com/Mondarth/EMMA/issues/38)
* **ui:** offer only GMs the choice to activate what a module recommends ([14f798d](https://github.com/Mondarth/EMMA/commit/14f798d15a50fe0c9ba18c70dab8aa3f14a8e62d))
* **ui:** open each setup report in its own window from toolbar toggles ([a003eff](https://github.com/Mondarth/EMMA/commit/a003eff3aaf8a742e45c9077d9924c539db56900))

### Bug Fixes

* **ui:** give each badge EMMA's verdict, or Foundry's if a user picks it ([0819ec1](https://github.com/Mondarth/EMMA/commit/0819ec11dd6374fb3693376621f642961a4dc3cb))
* **ui:** let the update find the best versions with a module ignored ([deaa0c2](https://github.com/Mondarth/EMMA/commit/deaa0c2eccecbc66fd026444692375ed885bf87d))
* **ui:** open report windows clear of EMMA's toolbar ([5b060c0](https://github.com/Mondarth/EMMA/commit/5b060c04c449bc662e3f6c7b80a47db221e30d5c))

## [0.7.0](https://github.com/Mondarth/EMMA/compare/v0.6.0...v0.7.0) (2026-10-26)

### Features

* **build:** build an obscured default catalogue into releases ([b56c8a3](https://github.com/Mondarth/EMMA/commit/b56c8a3794d32f1a5b73dc3f05e2139b3f6bb0d7))
* **settings:** ask EMMA's package catalogue first, before its proxy ([f3723ba](https://github.com/Mondarth/EMMA/commit/f3723bab728915a30de26b4c58b1f874f0e3b6df))
* **ui:** let hypothetical mode ignore a module from its context menu ([bc629e0](https://github.com/Mondarth/EMMA/commit/bc629e030100ced47ddb23d637b551deaed01a22))
* **ui:** mark versions not on Foundry's package listing ([39abc5a](https://github.com/Mondarth/EMMA/commit/39abc5aff90eadf67277ea9386c523c4baf84527))

### Bug Fixes

* **ui:** keep each version once, however many lookups find it ([6d5a58a](https://github.com/Mondarth/EMMA/commit/6d5a58a3887c2a358917c53969496530e42a2b87))
* **ui:** leave ignored modules out of reports, and warn that they are ([2b19a4a](https://github.com/Mondarth/EMMA/commit/2b19a4aef5f19a63b9c814bdad2ac972a5ca02dd))
* **ui:** name as unreached only packages that could not be listed ([6e747e0](https://github.com/Mondarth/EMMA/commit/6e747e038eb1a5c7f35fd4412022a193f2e5a99a))

### Performance Improvements

* **ui:** judge each version with only the releases of its setup ([9410584](https://github.com/Mondarth/EMMA/commit/94105844a5168b3ce06cb45713398c1ea6259cc1))

## [0.6.0](https://github.com/Mondarth/EMMA/compare/v0.5.0...v0.6.0) (2026-10-22)

### Features

* **build:** build an obscured default proxy into releases ([3c96ae7](https://github.com/Mondarth/EMMA/commit/3c96ae7f0d0d67ea2b69aeac3c8aa5805bdd4f45))
* **settings:** look versions up through EMMA's proxy by default ([039c96d](https://github.com/Mondarth/EMMA/commit/039c96d02c90fa542f3595e6f670c517abe24c48))

## [0.5.0](https://github.com/Mondarth/EMMA/compare/v0.4.0...v0.5.0) (2026-10-22)

### Features

* **ui:** offer two earlier versions in each module's drop-down ([d0dd9db](https://github.com/Mondarth/EMMA/commit/d0dd9dbc457d0bd40e5e1f36733f46e25cf07a4e))

### Bug Fixes

* **ui:** leave versions far older than the chosen one out of reports ([0868ffb](https://github.com/Mondarth/EMMA/commit/0868ffbdb9e86b14af61898af5e18cec7b8b7b30))
* **ui:** scroll each report within its pane ([bea0417](https://github.com/Mondarth/EMMA/commit/bea041723c7b01db0cfc177bfa4aec7b2fe098f0))

## [0.4.0](https://github.com/Mondarth/EMMA/compare/v0.3.0...v0.4.0) (2026-10-21)

### Features

* **settings:** add an API key for the version lookup proxy ([f970f40](https://github.com/Mondarth/EMMA/commit/f970f40b01932d73979206d56ba914a8239d6048))
* **ui:** add a hypothetical mode for choosing module versions ([583a0ea](https://github.com/Mondarth/EMMA/commit/583a0eaaeb0507b82802f6c74d2a163c57c7deff))
* **ui:** add core and system version lists to hypothetical mode ([2ccf101](https://github.com/Mondarth/EMMA/commit/2ccf101e95563f4c642387257d2075384bb970a8))
* **ui:** add setup reports and safe staging to hypothetical mode ([e1115a6](https://github.com/Mondarth/EMMA/commit/e1115a6cc7c2778a43f672d837f63909ce1cd6f5))

## [0.3.0](https://github.com/Mondarth/EMMA/compare/v0.2.0...v0.3.0) (2026-10-19)

### Features

* **ui:** add a select-all checkbox and a grouping toggle ([7c40904](https://github.com/Mondarth/EMMA/commit/7c4090418302541294b90b3d5f5682ba29903a1e))

### Bug Fixes

* **ui:** word the lock tooltip for one requiring module ([69a1e7e](https://github.com/Mondarth/EMMA/commit/69a1e7ef614cdc413e0c5bf9d42d236cd9739f51)), closes [#25](https://github.com/Mondarth/EMMA/issues/25)

## [0.2.0](https://github.com/Mondarth/EMMA/compare/v0.1.1...v0.2.0) (2026-10-18)

### Features

* **ui:** group related modules and lock required ones ([05cc279](https://github.com/Mondarth/EMMA/commit/05cc2799b63e08d52c9245b1dd3c0e82b93b4eb3))
* **ui:** group related modules in the split view ([b00f850](https://github.com/Mondarth/EMMA/commit/b00f850f120c4a08bdbae0ca591bbfab4d54b579))

## [0.1.1](https://github.com/Mondarth/EMMA/compare/v0.1.0...v0.1.1) (2026-10-18)

### Bug Fixes

* **ui:** keep triangles clear of the scrollbar and tint the drawers ([7478a0f](https://github.com/Mondarth/EMMA/commit/7478a0f3c6b5f30b505ca2e7f414a6e82b73ecb6))

## [0.1.0](https://github.com/Mondarth/EMMA/compare/v0.0.0...v0.1.0) (2026-10-18)

### Features

* **app:** open EMMA from the Settings sidebar ([f9a36de](https://github.com/Mondarth/EMMA/commit/f9a36de23483b5c920653e6290442dd64ef67d55))
* **app:** save staged changes and confirm discarding them ([bc9f28c](https://github.com/Mondarth/EMMA/commit/bc9f28cd25d7d351e9a88cd4cb1d3f74826f2a41))
* **settings:** ask before discarding unsaved detail choices ([ca8fa0f](https://github.com/Mondarth/EMMA/commit/ca8fa0f2fef68cf9c3aab02a40b760ffbabfe478))
* **state:** stage module activation changes ([39a8f92](https://github.com/Mondarth/EMMA/commit/39a8f92eb44bb15387c47dc9f1795c26bdf05c81))
* **ui:** add an expand-all button and count modules by their titles ([246d9fe](https://github.com/Mondarth/EMMA/commit/246d9fed2e5686462e86da859cfe206325261893))
* **ui:** add module details drawers and compatibility badges ([4eb3b21](https://github.com/Mondarth/EMMA/commit/4eb3b21dff4cdea1b4fc05988d6aa51d4c7e5daa))
* **ui:** add the split view ([1016464](https://github.com/Mondarth/EMMA/commit/1016464626dc0245fe98c7dc2886ace43e0cf79a))
* **ui:** add the toolbar and list view ([0efa778](https://github.com/Mondarth/EMMA/commit/0efa7786ab85bd26780bbacaa1489a3299ba6a19))
* **ui:** let each user choose the details drawers show ([ebff59f](https://github.com/Mondarth/EMMA/commit/ebff59ff2e48d3ce3856815256afdbe1022f0cca))

### Bug Fixes

* **ui:** give the window the Manage Modules button's cube icon ([3826800](https://github.com/Mondarth/EMMA/commit/38268005671bab5637f440761a43bbeb7ef7cfc2))
