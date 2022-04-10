// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

import App from './models/app';
import routes from './routes';

const applyRoutes = (server) => {
  // Plugin with multiple routes.
  server.route(routes);
};

export const name = 'appDomainPlugin';
export const version = '1.0.0';
export async function register(server, options) {
  const model = new App(options);
  server.app.model = model; // eslint-disable-line no-param-reassign
  applyRoutes(server);
}
