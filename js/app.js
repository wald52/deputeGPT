import { init } from './app-runtime.js';

export async function bootstrapApp() {
  return init();
}

bootstrapApp();

export default bootstrapApp;
