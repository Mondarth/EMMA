/**
 * The script the browser extension injects into Foundry VTT's setup screen. It starts EMMA there, and does nothing on
 * any other page.
 */
import { startEmmaSetup } from './app/start';

void startEmmaSetup();
