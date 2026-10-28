/**
 * The options page's script: reads the servers remembered and shows them.
 */
import { mount } from 'svelte';

import { readSites } from '../browser/api';
import Options from '../component/Options.svelte';

mount(Options, { target: document.body, props: { sites: await readSites() } });
