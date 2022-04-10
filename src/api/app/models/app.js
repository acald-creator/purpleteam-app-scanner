// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

import { loadConfiguration, loadSources } from '@cucumber/cucumber/api'; // eslint-disable-line import/no-unresolved
import { promises as fsPromises } from 'fs';
import model from './index.js';

const { readFile } = fsPromises;

class App {
  #log;
  #strings;
  #emissary;
  #cucumber;
  #results;
  #cloud;
  #debug;
  #s2Containers;
  #testingProps;
  #testSessionDoneCount;
  #sessionsProps;

  constructor({ log, strings, emissary, cucumber: cucumberConfig, results, cloud, debug, s2Containers }) {
    this.#log = log;
    this.#strings = strings;
    this.#emissary = emissary;
    this.#cucumber = cucumberConfig;
    this.#results = results;
    this.#cloud = cloud;
    this.#debug = debug;
    this.#s2Containers = s2Containers;
    this.#testingProps = null;
    this.#testSessionDoneCount = 0;
  }

  #statusMap = {
    'Awaiting Job.': true,
    'Initialising Tester.': false,
    'Tester initialised.': false,
    'App tests are running.': false
  };

  #status(state) {
    if (state) {
      Object.keys(this.#statusMap).forEach((k) => { this.#statusMap[k] = false; });
      this.#statusMap[state] = true;
      this.#log.info(`Setting status to: "${state}"`, { tags: ['app'] });
      return state;
    }
    return Object.entries(this.#statusMap).find((e) => e[1] === true)[0];
  }

  async reset() {
    const { deprovisionViaLambdaDto = 'empty', cloudFuncOpts = 'empty' } = this.#testingProps || {};
    if (deprovisionViaLambdaDto === 'empty' || cloudFuncOpts === 'empty') {
      this.#log.debug('reset() already invoked for this Test Run, not attempting to reset twice.', { tags: ['app'] });
      return;
    }
    this.#testSessionDoneCount = 0;
    this.#sessionsProps = [];
    await model.emissary.deprovisionS2ContainersViaLambda({ cloudFuncOpts, deprovisionViaLambdaDto });
    this.#status('Awaiting Job.');
    this.#testingProps = null;
  }

  async initTester(testJob) {
    this.#log.info(`Status currently set to: "${this.#status()}"`, { tags: ['app'] });
    if (this.#status() !== 'Awaiting Job.') return this.#status();
    this.#status('Initialising Tester.');
    const testRoutes = testJob.included.filter((resourceObject) => resourceObject.type === 'route');
    const testSessions = testJob.included.filter((resourceObject) => resourceObject.type === 'appScanner');

    this.#sessionsProps = testSessions.map((sesh) => ({
      ...(testRoutes.length > 0 ? { testRoutes } : {/* No test routes in API schema */}),
      sUtType: testJob.data.type,
      protocol: testJob.data.attributes.sutProtocol,
      ip: testJob.data.attributes.sutIp,
      port: testJob.data.attributes.sutPort,
      browser: testJob.data.attributes.browser || 'chrome', // Todo: Needs removing for API, along with selenium containers.
      loggedInIndicator: testJob.data.attributes.loggedInIndicator,
      loggedOutIndicator: testJob.data.attributes.loggedOutIndicator,
      context: { name: `${sesh.id}_Context` },
      authentication: testJob.data.attributes.sutAuthentication,
      testSession: sesh // The data array contains the relationships to the testSessions
    }));

    const initResult = await model.emissary.initEmissaries({
      sessionsProps: this.#sessionsProps,
      app: {
        log: this.#log,
        status: this.#status,
        cloud: this.#cloud,
        emissary: this.#emissary,
        s2Containers: this.#s2Containers
      },
      appInstance: this
    });
    this.#testingProps = initResult.testingProps;
    initResult.status.startsWith('Tester failure:') && await this.reset();

    return initResult.status; // This is propagated per session in the CLI model.
  }

  startCucs() {
    if (this.#testingProps) {
      model.cuc.startCucs({
        reset: this.reset,
        app: {
          log: this.#log,
          status: this.#status,
          createCucumberArgs: this.#createCucumberArgs,
          numberOfTestSessions: this.#numberOfTestSessions,
          testSessionDoneCount: () => this.#testSessionDoneCount,
          incrementTestSessionDoneCount: () => { this.#testSessionDoneCount += 1; },
          testingProps: { runableSessionsProps: this.#testingProps.runableSessionsProps },
          emissary: { shutdownEmissariesAfterTest: this.#emissary.shutdownEmissariesAfterTest },
          debug: {
            execArgvDebugString: this.#debug.execArgvDebugString,
            firstChildProcessInspectPort: this.#debug.firstChildProcessInspectPort
          }
        },
        appInstance: this
      });
    } else {
      this.#log.error('this.#testingProps was falsy. It appears that the Tester was reset between calling initTester and startCucs', { tags: ['app'] });
    }
  }

  async testPlan(testJob) {
    const sUtType = testJob.data.type;
    const tagExpression = { BrowserApp: '@app_scan', Api: '@api_scan' }[sUtType];
    const { runConfiguration } = await loadConfiguration({
      provided: {
        paths: [`${this.#cucumber.features}/${sUtType}`],
        require: [`${this.#cucumber.steps}/${sUtType}`],
        tags: tagExpression
      }
    });
    const loadSourcesResult = await loadSources(runConfiguration.sources);
    const activeFeatureFileUris = loadSourcesResult.plan.map((pickle) => pickle.uri)
      .reduce((accum, cV) => [...accum, ...(accum.includes(cV) ? [] : [cV])], []);
    return (await Promise.all(activeFeatureFileUris
      .map((aFFU) => readFile(aFFU, { encoding: 'utf8' }))))
      .reduce((accumulatedFeatures, feature) => `${accumulatedFeatures}${!accumulatedFeatures.length > 0 ? feature : `\n\n${feature}`}`, '');
  }

  #numberOfTestSessions() {
    return Array.isArray(this.#sessionsProps) ? this.#sessionsProps.length : 0;
  }

  // Receiving appEmissaryPort and seleniumPort are only essential if running in cloud environment.
  #createCucumberArgs({ sessionProps, emissaryHost = this.#emissary.hostname, seleniumContainerName = '', appEmissaryPort = this.#emissary.port, seleniumPort = 4444 }) {
    this.#log.debug(`seleniumContainerName is: ${seleniumContainerName}`, { tags: ['app'] });
    const emissaryProperties = {
      hostname: emissaryHost,
      protocol: this.#emissary.protocol,
      port: appEmissaryPort,
      apiKey: this.#emissary.apiKey,
      apiFeedbackSpeed: this.#emissary.apiFeedbackSpeed,
      reportDir: this.#emissary.report.dir,
      uploadDir: this.#emissary.upload.dir,
      spider: this.#emissary.spider
    };

    const cucumberParameters = {
      emissaryProperties,
      seleniumContainerName,
      seleniumPort,
      sutProperties: sessionProps,
      cucumber: { timeout: this.#cucumber.timeout }
    };

    const parameters = JSON.stringify(cucumberParameters);

    this.#log.debug(`The cucumberParameters are: ${parameters}`, { tags: ['app'] });

    const cucumberArgs = [
      this.#cucumber.binary,
      `${this.#cucumber.features}/${sessionProps.sUtType}`,
      '--require',
      `${this.#cucumber.steps}/${sessionProps.sUtType}`,
      /* '--exit', */
      `--format=message:${this.#results.dir}result_appScannerId-${sessionProps.testSession ? sessionProps.testSession.id : 'noSessionPropsAvailable'}_${this.#strings.NowAsFileName('-')}.NDJSON`,
      /* Todo: Provide ability for Build User to pass flag to disable colours */
      '--format-options',
      '{"colorsEnabled": true}',
      '--tags',
      sessionProps.sUtType === 'BrowserApp' ? '@app_scan' : '@api_scan',
      '--world-parameters',
      parameters
    ];

    // Todo: KC: Validation, Filtering and Sanitisation required, as these are being executed, although they should all be under our control.
    return cucumberArgs;
  }
}

export default App;
