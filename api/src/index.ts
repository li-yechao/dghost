import 'express-async-errors';

import { join } from 'path';

import { getComponentMountPoint } from '@blocklet/sdk';
import { env } from '@blocklet/sdk/lib/config';
import { user } from '@blocklet/sdk/lib/middlewares';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import express from 'express';
import proxy from 'express-http-proxy';
import getPort from 'get-port';
import { hasTrailingSlash, joinURL, parseURL, withQuery, withTrailingSlash } from 'ufo';

import { GHOST_BLOCKLET_DID } from './constants';
import { authClient } from './libs/auth';
import ghostManager from './libs/ghost-manager';
import logger from './libs/logger';

dotenv.config();

const { name, version } = require('../../package.json');

export const app = express();

let proxyToGhost: ReturnType<typeof proxy> | undefined;

app.use(cors());

// redirect to login page if user is not logged in
app.use('/ghost', user(), (req, res, next) => {
  const mountPoint = getComponentMountPoint(GHOST_BLOCKLET_DID);

  if (!req.user?.did) {
    res.redirect(
      withQuery('/.well-known/service/login', {
        redirect: withQuery(joinURL(mountPoint, req.originalUrl), req.query),
      }),
    );
    return;
  }

  // only allow user with permission to access the dashboard
  if (!['admin', 'owner', 'member'].includes(req.user.role)) {
    res.redirect(mountPoint);
    return;
  }

  next();
});

app.use('/', (req, res, next) => {
  if (proxyToGhost) {
    proxyToGhost(req, res, next);
  } else {
    next();
  }
});

const port = parseInt(process.env.BLOCKLET_PORT!, 10);

export const server = app.listen(port, (err?: any) => {
  if (err) throw err;
  logger.info(`> ${name} v${version} ready on ${port}`);
});

(async () => {
  const ghostPort = await getPort({ port: 2369 });

  const mountPoint = getComponentMountPoint(GHOST_BLOCKLET_DID);

  await ghostManager.start({ url: joinURL(env.appUrl, mountPoint), port: ghostPort });

  proxyToGhost = proxy(`http://localhost:${ghostPort}`, {
    proxyReqPathResolver(req) {
      const url = join(mountPoint, req.url);
      return hasTrailingSlash(req.url) ? withTrailingSlash(url) : url;
    },
    async proxyReqOptDecorator(proxyReqOpts, srcReq) {
      proxyReqOpts.headers ??= {};
      proxyReqOpts.headers['X-Forwarded-Proto'] = 'https';
      proxyReqOpts.headers.Host = parseURL(env.appUrl).host;

      const did = srcReq.get('x-user-did');
      if (did) {
        const user = await authClient.getUser(did);
        proxyReqOpts.headers['x-user-email'] = user.user.email;
      }

      return proxyReqOpts;
    },
  });
})();
