import { fork, spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readdir, rm, symlink, writeFile } from 'fs/promises';
import { join, relative } from 'path';

import { env } from '@blocklet/sdk/lib/config';
import { x } from 'tar';

const CONFIG_FILENAME = 'config.production.json';

class GhostManager {
  get ghostDir() {
    return join(process.env.BLOCKLET_APP_DIR!, 'ghost_dist');
  }

  get ghostDataDir() {
    return join(env.dataDir, 'ghost');
  }

  get contentDir() {
    return join(this.ghostDataDir, 'content');
  }

  get currentPath() {
    return join(this.ghostDir, 'current');
  }

  private async ensureContentDirs() {
    const dirs = ['apps', 'data', 'files', 'images', 'logs', 'media', 'public', 'settings', 'themes'];
    for (const dir of dirs) {
      await mkdir(join(this.contentDir, dir), { recursive: true });
    }

    const currentThemesDir = join(this.currentPath, 'content', 'themes');
    if (existsSync(currentThemesDir)) {
      const themes = await readdir(currentThemesDir);

      for (const theme of themes) {
        const p = join(this.contentDir, 'themes', theme);
        await rm(p, { recursive: true, force: true });

        await symlink(join(this.ghostDir, 'current/content/themes', theme), p);
      }
    }
  }

  async install({
    archive,
    version,
    strip = 1,
    overwrite,
  }: {
    archive: string;
    version: string;
    strip?: number;
    overwrite?: boolean;
  }) {
    const ghostSrcDir = join(this.ghostDir, 'versions', version);

    if (overwrite) await rm(ghostSrcDir, { recursive: true, force: true });

    await mkdir(ghostSrcDir, { recursive: true });
    await x({ file: archive, cwd: ghostSrcDir, strip });
    await new Promise((resolve, reject) => {
      spawn('npx', ['-y', 'yarn', 'install', '--production', '--ignore-engines'], {
        cwd: ghostSrcDir,
        stdio: ['ignore', 'inherit', 'inherit'],
      })
        .on('close', (code) => resolve(code))
        .on('error', (error) => reject(error));
    });

    // link ghost/current to ghost/versions/[VERSION]
    await rm(this.currentPath, { force: true });
    await symlink(relative(this.ghostDir, ghostSrcDir), this.currentPath);
  }

  private ghostProcess?: ReturnType<typeof fork>;

  async start({ url, host = '127.0.0.1', port }: { url: string; host?: string; port: number }) {
    await this.ensureContentDirs();

    await writeFile(
      join(this.ghostDataDir, CONFIG_FILENAME),
      JSON.stringify(
        {
          url,
          server: {
            port,
            host,
          },
          database: {
            client: 'sqlite3',
            connection: {
              filename: join(this.contentDir, 'data/ghost.db'),
            },
          },
          mail: {
            transport: 'Direct',
          },
          logging: {
            transports: ['file', 'stdout'],
          },
          process: 'local',
          paths: {
            contentPath: this.contentDir,
          },
        },
        null,
        2,
      ),
    );

    this.stop();

    // TODO: symlink current and config.production.json to a temp folder of ghost blocklet instead of data dir,
    // the data dir will be synced to did space
    await rm(join(this.ghostDataDir, 'current'), { force: true, recursive: true });
    await symlink(join(this.ghostDir, 'current'), join(this.ghostDataDir, 'current'));

    this.ghostProcess = fork(join(this.ghostDataDir, 'current/index.js'), {
      cwd: this.ghostDataDir,
      env: { NODE_ENV: 'production' },
    });
  }

  stop() {
    if (this.ghostProcess) {
      if (!this.ghostProcess.kill('SIGINT')) throw new Error('Kill ghost process failed');
    }

    this.ghostProcess = undefined;
  }
}

(globalThis as any).ghostManager ??= new GhostManager();
const ghostManager = (globalThis as any).ghostManager as GhostManager;

export default ghostManager;
