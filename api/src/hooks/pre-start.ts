import '@blocklet/sdk/lib/error-handler';

import { join } from 'path';

import dotenv from 'dotenv-flow';

import ghostManager from '../libs/ghost-manager';

dotenv.config();

(async () => {
  try {
    await ghostManager.install({
      archive: join(process.env.BLOCKLET_APP_DIR!, 'ghost-5.90.1.tgz'),
      overwrite: false,
      version: '5.90.1',
    });

    process.exit(0);
  } catch (err) {
    console.error('pre-start error', err);
    process.exit(1);
  }
})();
