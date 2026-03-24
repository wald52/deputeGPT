import { init as bootstrapApp } from './app-runtime.js';
import { createPwaController } from './ui/pwa-controller.js';

const pwaController = createPwaController();

void pwaController.init();
bootstrapApp();

export { bootstrapApp, pwaController };
export default bootstrapApp;
