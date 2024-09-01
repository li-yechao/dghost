// This script is used to install ghost versions in the ghost blocklet
// TODO: remove this script after the issue fixed https://github.com/ArcBlock/blocklet-server/issues/9691

const { join, relative, resolve } = require('path');
const { spawnSync } = require('child_process');
const { x } = require('tar');
const { readdirSync, mkdirSync, rmSync, symlinkSync } = require('fs');

const serverDir = process.env.ABT_NODE_DATA_DIR;
if (!serverDir) return;

const ghostBlockletsDir = resolve(serverDir, 'blocklets/z2qaL6E9od1SFDfKP8d9zAWPZq45jbY6wkCWt');

(async () => {
  for (const version of readdirSync(ghostBlockletsDir)) {
    const appDir = resolve(serverDir, 'blocklets/z2qaL6E9od1SFDfKP8d9zAWPZq45jbY6wkCWt', version);

    const ghostDir = join(appDir, 'ghost_dist');
    const currentPath = join(ghostDir, 'current');

    const archiveFilename = readdirSync(appDir).find((i) => /^ghost-\d+\.\d+\.\d+\.tgz$/.test(i));
    if (!archiveFilename) throw new Error(`Missing ghost archive file in ${appDir}`);

    const archive = join(appDir, archiveFilename);
    const ghostVersion = archiveFilename.match(/^ghost-(\d+\.\d+\.\d+)\.tgz$/)[1];

    const ghostSrcDir = join(ghostDir, 'versions', ghostVersion);

    mkdirSync(ghostSrcDir, { recursive: true });
    await x({ file: archive, cwd: ghostSrcDir, strip: 1 });
    spawnSync('npx', ['-y', 'yarn', 'install', '--production', '--ignore-engines', '--update-checksums'], {
      cwd: ghostSrcDir,
      stdio: ['ignore', 'inherit', 'inherit'],
    });

    // link ghost/current to ghost/versions/[VERSION]
    rmSync(currentPath, { force: true });
    symlinkSync(relative(ghostDir, ghostSrcDir), currentPath);
  }
})();
