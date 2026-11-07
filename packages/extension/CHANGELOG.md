## [0.4.0](https://github.com/Mondarth/EMMA/compare/extension-v0.3.0...extension-v0.4.0) (2026-11-07)

### Features

* **setup:** install several packages at once, each after what it needs ([8d73a21](https://github.com/Mondarth/EMMA/commit/8d73a211247b221be5a78d79f04eea4a4c3467b2))
* **setup:** mark a package installed anew below its newest in the plan ([6330100](https://github.com/Mondarth/EMMA/commit/63301003f8f4b8add355224b8b7103c80c55a134))
* **setup:** say why a version is taken, and why a step failed ([2fa8c8c](https://github.com/Mondarth/EMMA/commit/2fa8c8c1fa7ea967acb96adeb939ea464adca3c7))
* **setup:** show how far each install has got as the plan runs ([f002eff](https://github.com/Mondarth/EMMA/commit/f002eff07fe2b460a72b344b36c6d1d1fa7c5bab))
* **setup:** show what EMMA is doing over the item it works on ([5b59c45](https://github.com/Mondarth/EMMA/commit/5b59c456cb9041a435bc74376a0b9b8a650859ee))

### Bug Fixes

* **setup:** end a step's run with its own green bar, not another ([01d336d](https://github.com/Mondarth/EMMA/commit/01d336d2f399901af9f5259b20ccff421f60d27e))
* **setup:** fold versions refused alike though each names itself ([ea5d32a](https://github.com/Mondarth/EMMA/commit/ea5d32a5334c7c1e29fd48e9b2202ca2a4316bdb))
* **setup:** keep what EMMA is busy with in sight long enough to see ([005caee](https://github.com/Mondarth/EMMA/commit/005caeec6028b03bb633817eeef48def8b2c351f))
* **setup:** open a version list at once, checking, not after the check ([34a91c3](https://github.com/Mondarth/EMMA/commit/34a91c333cda6d5b141b3a6d8ad6126c1997587f))

## [0.3.0](https://github.com/Mondarth/EMMA/compare/extension-v0.2.1...extension-v0.3.0) (2026-11-06)

### Features

* **module:** drop the version lookup proxy ([9802b80](https://github.com/Mondarth/EMMA/commit/9802b8020cba1b442d0ac072ef23f19ac98adf05))
* **module:** give the catalogue's version 2 in the setup kit ([a8c8af2](https://github.com/Mondarth/EMMA/commit/a8c8af28ae4c17e0d3cbfa5e4bafca90d1f6e441))
* **setup:** find updates with one catalogue lookup, and no proxy ([0f90ccd](https://github.com/Mondarth/EMMA/commit/0f90ccd0234c2f5884869f4eea876f8bb09ff9cd))
* **setup:** keep the plan as it runs, to resume it ([0dddfa5](https://github.com/Mondarth/EMMA/commit/0dddfa590bccbbbd52f77fce745f150c5de67a76))
* **setup:** read the Install listing from the catalogue ([235a847](https://github.com/Mondarth/EMMA/commit/235a8474adb8c7047e9d6311f068fcc4a80c6992))
* **setup:** say how fresh the catalogue is, and let the user check live ([8ef1499](https://github.com/Mondarth/EMMA/commit/8ef14990e35952d87c8bba0506829b1ccdd41108))

### Bug Fixes

* **setup:** say what planning the best versions came to ([c90fe4b](https://github.com/Mondarth/EMMA/commit/c90fe4b41f3fdfae23847107d37ab5d01795fa41))

## [0.2.1](https://github.com/Mondarth/EMMA/compare/extension-v0.2.0...extension-v0.2.1) (2026-11-04)

### Bug Fixes

* **setup:** import the setup kit from an absolute URL ([a8caa17](https://github.com/Mondarth/EMMA/commit/a8caa17d8838e28f51d1cd0a05a77754c6fd615e))
* **setup:** judge versions with the modules they newly require ([261bfb6](https://github.com/Mondarth/EMMA/commit/261bfb667908fb2572bc7f186ee8f50031faf792))

## [0.2.0](https://github.com/Mondarth/EMMA/compare/extension-v0.1.1...extension-v0.2.0) (2026-11-04)

### Features

* **core:** define the setup kit the EMMA extension takes from EMMA ([c33d26f](https://github.com/Mondarth/EMMA/commit/c33d26f3668dea41d6f08478733fd032b3ac8f32))
* **module:** give the setup kit how EMMA badges a version ([c758a82](https://github.com/Mondarth/EMMA/commit/c758a82c576969b30ab70cdf66dcaa29797dbfca))
* **module:** tell the GM what changed since the world last ran ([3d7a790](https://github.com/Mondarth/EMMA/commit/3d7a7900def82dc2b5e0fa246abd10b12b2c64b9))
* **setup:** add an ignore toggle for worlds, systems and modules ([098b25c](https://github.com/Mondarth/EMMA/commit/098b25c1d2a8d5e462c562bdb071bd6fd4dfc945))
* **setup:** add packages to install by checkbox, with titles as drawers ([f2bc3cd](https://github.com/Mondarth/EMMA/commit/f2bc3cdb874a0611d85858033c3bc2516d786724))
* **setup:** bring in the modules a module recommends, as wanted ([164f30b](https://github.com/Mondarth/EMMA/commit/164f30b8eb8f2b7934c5749a8cb08e5925c17e72))
* **setup:** colour Update mode's versions by EMMA's badges ([414f356](https://github.com/Mondarth/EMMA/commit/414f3562874616ba1dda3a82df2bc610099dbee4))
* **setup:** explain the versions looked at and chosen in the panel ([a549b2e](https://github.com/Mondarth/EMMA/commit/a549b2ef0ba927a2e055849f2781b0ea7b25359d))
* **setup:** explain what versions need, and why updates are blocked ([bb6f78d](https://github.com/Mondarth/EMMA/commit/bb6f78d0ab269c26da4d16ee066cad0fe87dac42))
* **setup:** filter the install list and show each package's details ([4402b5d](https://github.com/Mondarth/EMMA/commit/4402b5d9c4c8c1a044ea15ebbbd4a41057450f8e))
* **setup:** filter the modules to install by their tags ([982ad78](https://github.com/Mondarth/EMMA/commit/982ad788bccb16de362c3688f9c0fbbf6563683e))
* **setup:** find in the tree by typing, and link panels to it ([3d97615](https://github.com/Mondarth/EMMA/commit/3d97615556ea1007b849dbae41d2151b4d667ec9))
* **setup:** find updates, and plan the versions chosen in Update mode ([ef32fa4](https://github.com/Mondarth/EMMA/commit/ef32fa48c5f23a30f0bfeaac29f3b69ccd4554af))
* **setup:** install a package from a manifest URL, or against advice ([a188a8a](https://github.com/Mondarth/EMMA/commit/a188a8a5e41cf62a921f3dab1f9ada2bd910cec0))
* **setup:** install and update from a "latest" manifest ([027fa0d](https://github.com/Mondarth/EMMA/commit/027fa0d873dfae47794dd613cdf89cf0785ab1b5))
* **setup:** install game systems and modules anew from the plan ([7493950](https://github.com/Mondarth/EMMA/commit/74939505897b59138fb99e2b41f87580e115187a))
* **setup:** list what a module to install requires and recommends ([5bbabf9](https://github.com/Mondarth/EMMA/commit/5bbabf9bff3fedfa81a710dd6a0ca31eebad920e))
* **setup:** lock Foundry VTT at its build in EMMA ([84033ee](https://github.com/Mondarth/EMMA/commit/84033ee32054c97d6ecea2b558a785ca81ac2301))
* **setup:** lock versions with no manifest of their own ([dea3095](https://github.com/Mondarth/EMMA/commit/dea3095b5960d064279da5a4e98187788eb9463b))
* **setup:** look up releases through EMMA's default proxy ([580d83e](https://github.com/Mondarth/EMMA/commit/580d83e0a092139995c919a6b266eca640d8d247))
* **setup:** mark collapsed tree rows that hide an update ([0405305](https://github.com/Mondarth/EMMA/commit/04053050f75138b0bf80a9af2805cf211ee2b12c))
* **setup:** mark Foundry VTT's row when it cannot update in place ([a8f2b4b](https://github.com/Mondarth/EMMA/commit/a8f2b4bdf84af00c6b60ec030d6f7de625484f3e))
* **setup:** mark the modules a world uses as in use, in their groups ([b85dd40](https://github.com/Mondarth/EMMA/commit/b85dd4029f348612e4656e3c3cc1552198c57e32))
* **setup:** name the scope of the modules a group offers to install ([a240c70](https://github.com/Mondarth/EMMA/commit/a240c70963c5a9cbd772a2208bb12b1483cc1858))
* **setup:** offer a snapshot and world backups first in the plan ([9830e40](https://github.com/Mondarth/EMMA/commit/9830e40030735b18eaf851bd743669441581b8a8))
* **setup:** offer Foundry VTT updates through EMMA's proxy ([5656f90](https://github.com/Mondarth/EMMA/commit/5656f90c8a708fed8c75e96afdb8d742d021629d))
* **setup:** offer the newest build of Foundry VTT's generation ([88042f2](https://github.com/Mondarth/EMMA/commit/88042f2189e0e040ab7de96b2e72400b91f4f9eb))
* **setup:** offer to limit the best versions to what worlds use ([e4889f0](https://github.com/Mondarth/EMMA/commit/e4889f0737a6482d3d6479dbac0377072e184f22))
* **setup:** offer versions always, and drop the Update button ([01eeb57](https://github.com/Mondarth/EMMA/commit/01eeb5753f66a217c2bf122a6a8c67189f0d1140))
* **setup:** open EMMA's window where it was last left ([c8a899c](https://github.com/Mondarth/EMMA/commit/c8a899cdcec2e18404897285302610b2a8b4b5f6))
* **setup:** order the plan as it is to be installed ([5b3df06](https://github.com/Mondarth/EMMA/commit/5b3df0692124ff3a1b8eeb7b202c87977aaa649e))
* **setup:** pin locked packages, and guard Foundry's uninstall and lock ([51ed18e](https://github.com/Mondarth/EMMA/commit/51ed18ec3852edcf1320d379d5cc078c912f56d5))
* **setup:** plan the best versions of all packages at once ([4e92bbd](https://github.com/Mondarth/EMMA/commit/4e92bbd183f3921c0135ad9a4dc3855b72ff5be8))
* **setup:** plan updates as one coherent set ([ba7606c](https://github.com/Mondarth/EMMA/commit/ba7606c3c51ce2e57c8e19f9851ce086e8eec78f))
* **setup:** run the update plan ([bc3cec9](https://github.com/Mondarth/EMMA/commit/bc3cec9dcfdf8bf94cdde5b80a4ca6271b939cc7))
* **setup:** say a module is active in a world, not run by it ([4f6c960](https://github.com/Mondarth/EMMA/commit/4f6c96049d6bd4f3a2f21bcd624544774efbd84f))
* **setup:** say a version is in use, and mark what the plan changes ([bd800d8](https://github.com/Mondarth/EMMA/commit/bd800d8266021b187c15848c56694dbbffc00279))
* **setup:** say what a change is needed through ([f4e1579](https://github.com/Mondarth/EMMA/commit/f4e157944b1f9273632ec4654ad8c3f7480d9a46))
* **setup:** scroll a group's list past ten entries ([2d60ca6](https://github.com/Mondarth/EMMA/commit/2d60ca6b4303c3b3f7e49776855b8a0fe6ad86a4))
* **setup:** show more of the install list as it is scrolled ([c532c6a](https://github.com/Mondarth/EMMA/commit/c532c6a42d8dc55b1101aec7bc23417ca1d44a7b))
* **setup:** show the game system version each world last ran with ([7dbdd0f](https://github.com/Mondarth/EMMA/commit/7dbdd0f81c711cb39c053ee87791a9459208bbc7))
* **setup:** show the installation by game system and by module ([bacdfe5](https://github.com/Mondarth/EMMA/commit/bacdfe5c44ac3ecc5f48944a0a610913598c2c0b))
* **setup:** show the manifest URL that installs each version planned ([4226bf3](https://github.com/Mondarth/EMMA/commit/4226bf317ea7f39720fbdc70da37b35f072c9ef9))
* **setup:** show the packages the plan installs in the tree, pending ([443d833](https://github.com/Mondarth/EMMA/commit/443d83370df11b79730f8f8b202aa67c9f46abfd))
* **setup:** show the updates EMMA cannot offer, and why ([1d13f12](https://github.com/Mondarth/EMMA/commit/1d13f12384eeb621ac302ee71c20030d598e1ad0))
* **setup:** take a change out of the plan from its row ([77a37b0](https://github.com/Mondarth/EMMA/commit/77a37b0bbcd21cb93e220d3d1760afc499fd801d))
* **setup:** take the resolver from the EMMA module's setup kit ([5f1ffc9](https://github.com/Mondarth/EMMA/commit/5f1ffc9b784efbbe432c14b0f14ddd301bf5707a))
* **setup:** uninstall game systems and modules from the plan ([8349b7b](https://github.com/Mondarth/EMMA/commit/8349b7b5b7f02ed5b4a2466b535b13d9fe242e4d))
* **setup:** warn before updating Foundry VTT in place, and offer it ([0fec105](https://github.com/Mondarth/EMMA/commit/0fec105247215554f90ea8c22efc7fe64d1033c0))
* **setup:** warn of the alpha, and have it acknowledged before a run ([8090d91](https://github.com/Mondarth/EMMA/commit/8090d91781b40e64ef0eceb29055368949712d37))

### Bug Fixes

* **setup:** bring in the needs of modules active in no world ([67ad52c](https://github.com/Mondarth/EMMA/commit/67ad52cdfc6d948fcaaf487726c13f80f165b1d6))
* **setup:** find a package to install by its listed manifest URL ([839e4f3](https://github.com/Mondarth/EMMA/commit/839e4f31ebc10ca80a9bbe4dde9e985992f547d5))
* **setup:** fix installed recommendations, and say why one is refused ([dd6b6e5](https://github.com/Mondarth/EMMA/commit/dd6b6e51101f24019e7e10f167a04082ce514476))
* **setup:** keep the plan's buttons in view, and clear a run's status ([0edd36b](https://github.com/Mondarth/EMMA/commit/0edd36bc4d9ff5ab85936e66f13e92203df87f22))
* **setup:** keep the versions chosen, and lock what they rule out ([07e1b83](https://github.com/Mondarth/EMMA/commit/07e1b83fbfa421fef92fa8a18c037d76a20b1ca7))
* **setup:** keep what another change needs locked in when one goes ([d5e1ff7](https://github.com/Mondarth/EMMA/commit/d5e1ff7307cb3b3185292c86423ccb41c62a1f50))
* **setup:** let the scrolling group list be focused without a warning ([458f05d](https://github.com/Mondarth/EMMA/commit/458f05d246c349f4753838d45928cd9e0735cf7b))
* **setup:** link changes only where a relationship breaks ([6469ad4](https://github.com/Mondarth/EMMA/commit/6469ad45f7d31bf2ab713c000d84c60a1e9692d9))
* **setup:** list the worlds that will need a module when next run ([fe2e89e](https://github.com/Mondarth/EMMA/commit/fe2e89ea231c4b0ee5097914f13540bfe4109c9c))
* **setup:** name each change a change is needed through, not one way ([1acecd5](https://github.com/Mondarth/EMMA/commit/1acecd5f2465a4a61eb42331f567b53b8a5dd34e))
* **setup:** name what comes in on a recommendation by its title ([c4140bc](https://github.com/Mondarth/EMMA/commit/c4140bcf8184aac90de06fdc602151d584598910))
* **setup:** offer the modules for a game system the plan installs ([e1c8725](https://github.com/Mondarth/EMMA/commit/e1c8725aa9e10ffbf9e6af4a12d1fcb0bdcf3101))
* **setup:** offer the version from each package's own manifest ([d8cfaf7](https://github.com/Mondarth/EMMA/commit/d8cfaf73bdcbf9bcbc92c9f5ecd30086bd243efd))
* **setup:** say what a change of Foundry VTT is needed through ([4458e72](https://github.com/Mondarth/EMMA/commit/4458e72102b71698dd6b3a8d5f7aa4dcd018f5eb))
* **setup:** say why a manifest URL could not be read ([797b2aa](https://github.com/Mondarth/EMMA/commit/797b2aa39c1233003e1f6939fc42dc030fc8a08d))
* **setup:** show one tooltip, not the browser's as well as Foundry's ([f90ac4e](https://github.com/Mondarth/EMMA/commit/f90ac4e07cc6d697c2ee428450e292956b5526ed))
* **setup:** take a change in a ring out with the changes it needs ([45b3fab](https://github.com/Mondarth/EMMA/commit/45b3fab3933b84ef20f6e1b23dc415ad92e0bbcc))

## [0.1.1](https://github.com/Mondarth/EMMA/compare/extension-v0.1.0...extension-v0.1.1) (2026-10-29)

### Bug Fixes

* **extension:** name the extension's scripts from its root ([231cc84](https://github.com/Mondarth/EMMA/commit/231cc84c493c2e9a542cb513fc49ab6c9c782038))
* **extension:** require Firefox 157, the oldest seen to run EMMA ([dbaea99](https://github.com/Mondarth/EMMA/commit/dbaea9932635c3549721f9290fb002917a776096))
