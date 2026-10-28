// DOM matchers (`toBeInTheDocument`, `toHaveTextContent`, …) for every unit test.
import '@testing-library/jest-dom/vitest';

import { ApplicationV2Mock } from './mocks/foundry';

// EMMA's window extends Foundry's ApplicationV2 as soon as its module loads, before any test installs its mocks.
Object.assign(globalThis, { foundry: { applications: { api: { ApplicationV2: ApplicationV2Mock } } } });
