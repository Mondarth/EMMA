/**
 * The options page's script: reads the servers remembered and shows them, with the catalogue account.
 */
import { mount } from 'svelte';

import { readSites } from '../browser/api';
import Options from '../component/Options.svelte';

mount(Options, { target: document.body, props: { sites: await readSites(), catalogue: __EMMA_CATALOGUE_URL__ } });
