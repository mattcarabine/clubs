/** The app under test (`vite preview`). */
export const APP_PORT = 4173;
/** The fake EA upstream. Must match `env.test.vars.EA_BASE_URL` in wrangler.jsonc. */
export const FAKE_EA_PORT = 4180;

export const APP_URL = `http://localhost:${APP_PORT}`;
export const FAKE_EA_URL = `http://localhost:${FAKE_EA_PORT}`;
