/**
 * The popup's script: reads the tab the user is on and the servers remembered, and shows the popup for them.
 */
import { mount } from 'svelte';

import { readSites } from '../browser/api';
import Popup from '../component/Popup.svelte';

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
mount(Popup, {
  target: document.body,
  props: {
    tab: { id: tab?.id, url: tab?.url },
    sites: await readSites(),
    onManage: () => {
      void chrome.runtime.openOptionsPage();
    },
    onDone: () => {
      window.close();
    },
  },
});
