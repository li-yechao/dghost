import { fork, spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readdir, rm, symlink, writeFile } from 'fs/promises';
import { join, relative } from 'path';

import { env } from '@blocklet/sdk/lib/config';
import { x } from 'tar';

class GhostManager {
  get ghostDir() {
    return join(env.dataDir, 'ghost');
  }

  get contentDir() {
    return join(this.ghostDir, 'content');
  }

  get currentPath() {
    return join(this.ghostDir, 'current');
  }

  async ensureContentDirs() {
    await rm(join(this.contentDir, 'themes'), { recursive: true, force: true });

    const dirs = ['apps', 'data', 'files', 'images', 'logs', 'media', 'public', 'settings', 'themes'];
    for (const dir of dirs) {
      await mkdir(join(this.contentDir, dir), { recursive: true });
    }

    const currentThemesDir = join(this.currentPath, 'content', 'themes');
    if (existsSync(currentThemesDir)) {
      const themes = await readdir(currentThemesDir);

      for (const theme of themes) {
        await symlink(
          relative(join(this.contentDir, 'themes'), join(this.ghostDir, 'current/content/themes', theme)),
          join(this.contentDir, 'themes', theme),
        );
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

    await rm(this.currentPath, { force: true });
    await symlink(relative(this.ghostDir, ghostSrcDir), this.currentPath);
  }

  private ghostProcess?: ReturnType<typeof fork>;

  async start({ url, host = '127.0.0.1', port }: { url: string; host?: string; port: number }) {
    await this.ensureContentDirs();

    await writeFile(
      join(this.ghostDir, 'config.production.json'),
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
              filename: './content/data/ghost.db',
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
            contentPath: './content',
          },
        },
        null,
        2,
      ),
    );

    this.stop();

    this.ghostProcess = fork(join(this.currentPath, 'index.js'), {
      cwd: this.ghostDir,
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
