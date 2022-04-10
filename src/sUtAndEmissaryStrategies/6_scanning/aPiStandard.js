// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

const Scanning = require('./strategy');

class ApiStandard extends Scanning {
  #sutPropertiesSubSet;
  #emissaryPropertiesSubSet;
  #fileName = 'aPiStandard';

  constructor({ log, publisher, baseUrl, sutPropertiesSubSet, emissaryPropertiesSubSet, zAp }) {
    super({ log, publisher, baseUrl, zAp });
    this.#sutPropertiesSubSet = sutPropertiesSubSet;
    this.#emissaryPropertiesSubSet = emissaryPropertiesSubSet;
  }

  async scan() {
    const methodName = 'scan';
    const {
      testSession: { id: testSessionId },
      context: { id: contextId },
      userId
    } = this.#sutPropertiesSubSet;
    const {
      apiFeedbackSpeed,
      spider: { maxChildren }
    } = this.#emissaryPropertiesSubSet;
    const that = this;
    const recurse = true;
    const subtreeOnly = true;

    let numberOfAlertsForSesh = 0;
    let combinedStatusValueOfRoutesForSesh = 0;
    let sutAttackUrl;
    let scanTargetIdForAscanCallback;
    let scanId;

    this.publisher.pubLog({ testSessionId, logLevel: 'info', textData: `The ${methodName}() method of the ${super.constructor.name} strategy "${this.constructor.name}" has been invoked.`, tagObj: { tags: [`pid-${process.pid}`, this.#fileName, methodName] } });

    const zapApiSpiderScanAsUser = (zapResult) => {
      const spiderScanId = zapResult.scanAsUser;
      let runStatus = true;
      const spiderScanAsUserLogText = `Spider scan as user: "${userId}", for URL: "${this.baseUrl}", context: "${contextId}", with scanAsUser Id: "${spiderScanId}", with maxChildren: "${maxChildren}", with recurse: "${recurse}", with subtreeOnly: "${subtreeOnly}" was called, for Test Session with id: "${testSessionId}". Response was: ${JSON.stringify(zapResult)}.`;
      this.log.info(spiderScanAsUserLogText, { tags: [`pid-${process.pid}`, this.#fileName, methodName] });
      this.publisher.publish(testSessionId, spiderScanAsUserLogText);
      return new Promise((resolve, reject) => {
        let statusValueForSpiderScanAsUser = 'no status yet';
        let zapError;
        let zapInProgressIntervalId;

        async function status() {
          if (!runStatus) return;
          await that.zAp.aPi.spider.viewStatus({ scanId: spiderScanId }).then(
            (result) => {
              if (result) statusValueForSpiderScanAsUser = parseInt(result.status, 10);
              else statusValueForSpiderScanAsUser = undefined;
            },
            (error) => {
              if (error) zapError = (error.error.code === 'ECONNREFUSED') ? error.message : '';
            }
          );
        }
        zapInProgressIntervalId = setInterval(() => { // eslint-disable-line prefer-const
          status();
          if ((zapError && statusValueForSpiderScanAsUser !== 100) || (statusValueForSpiderScanAsUser === undefined)) {
            this.publisher.pubLog({ testSessionId, logLevel: 'error', textData: `Cancelling test. Zap API is unreachable. ${zapError ? `Zap Error: ${zapError}` : 'No status value available, may be due to incorrect api key.'}`, tagObj: { tags: [`pid-${process.pid}`, this.#fileName, methodName] } });
            clearInterval(zapInProgressIntervalId);
            reject(new Error(`Test failure: ${zapError}`));
          } else if (statusValueForSpiderScanAsUser === 100) {
            const spiderFinishingScanAsUserLogText = `The spider is finishing scan as user: "${userId}", for URL: "${this.baseUrl}", context: "${contextId}", with scanAsUser Id: "${spiderScanId}", for Test Session with id: "${testSessionId}".`;
            this.log.info(spiderFinishingScanAsUserLogText, { tags: [`pid-${process.pid}`, this.#fileName, methodName] });
            this.publisher.publish(testSessionId, spiderFinishingScanAsUserLogText);
            clearInterval(zapInProgressIntervalId);
            runStatus = false;
            resolve();
          }
        }, apiFeedbackSpeed);
      });
    };

    const zapApiAscanScanPerRoute = (zapResult) => {
      scanId = zapResult.scan;
      let runStatus = true;
      return new Promise((resolver, reject) => {
        let statusValueForRoute = 'no status yet';
        let zapError;
        let zapInProgressIntervalId;
        this.publisher.pubLog({ testSessionId, logLevel: 'info', textData: `Active scan initiated for Test Session with id: "${testSessionId}", scan target: "${scanTargetIdForAscanCallback}". Response was: ${JSON.stringify(zapResult)}.`, tagObj: { tags: [`pid-${process.pid}`, this.#fileName, methodName] } });

        let numberOfAlertsForRoute = 0;
        async function status() {
          if (!runStatus) return;
          await that.zAp.aPi.ascan.viewStatus({ scanId }).then(
            (result) => {
              if (result) statusValueForRoute = parseInt(result.status, 10);
              else statusValueForRoute = undefined;
            },
            (error) => {
              // If we get 'ECONNREFUSED', we may need to increase the number of retries from the default (2).
              zapError = (error.code === 'ECONNREFUSED') ? error.message : '';
              that.log.error(`An error occurred while attempting to get active scan status from Zap. The error was: "${error.message}".`, { tags: [`pid-${process.pid}`, that.#fileName, methodName] });
            }
          );
          await that.zAp.aPi.core.viewNumberOfAlerts({ baseurl: sutAttackUrl }).then(
            (result) => {
              if (result) numberOfAlertsForRoute = parseInt(result.numberOfAlerts, 10);
              if (runStatus) {
                that.publisher.pubLog({ testSessionId, logLevel: 'notice', textData: `Scan ${scanId} is ${`${statusValueForRoute}%`.padEnd(4)} complete with ${`${numberOfAlertsForRoute}`.padEnd(3)} alerts for scan target: "${scanTargetIdForAscanCallback}", for Test Session with id: "${testSessionId}".`, tagObj: { tags: [`pid-${process.pid}`, that.#fileName, methodName] } });
                that.publisher.publish(testSessionId, (combinedStatusValueOfRoutesForSesh + statusValueForRoute), 'testerPctComplete');
                that.publisher.publish(testSessionId, numberOfAlertsForSesh + numberOfAlertsForRoute, 'testerBugCount');
              }
            },
            (error) => { zapError = error.message; }
          );
        }
        zapInProgressIntervalId = setInterval(() => { // eslint-disable-line prefer-const
          status();
          if ((zapError && statusValueForRoute !== 100) || (statusValueForRoute === undefined)) {
            that.publisher.pubLog({ testSessionId, logLevel: 'error', textData: `Cancelling test. Zap API is unreachable. Zap Error: ${zapError}`, tagObj: { tags: [`pid-${process.pid}`, that.#fileName, methodName] } });
            clearInterval(zapInProgressIntervalId);
            reject(new Error(`Test failure: ${zapError}`));
          } else if (statusValueForRoute === 100) {
            that.publisher.pubLog({ testSessionId, logLevel: 'notice', textData: `Finishing scan ${scanId} for scan target: "${scanTargetIdForAscanCallback}", for Test Session with id: "${testSessionId}". Please see the report for further details.`, tagObj: { tags: [`pid-${process.pid}`, that.#fileName, methodName] } });
            clearInterval(zapInProgressIntervalId);
            numberOfAlertsForSesh += numberOfAlertsForRoute;
            combinedStatusValueOfRoutesForSesh += statusValueForRoute;
            // status();
            // resolveOfPromiseWithinPromiseOfAscan();

            runStatus = false;
            resolver(`Finishing scan ${scanId} for scan target: "${scanTargetIdForAscanCallback}". Please see the report for further details.`);
          }
        }, apiFeedbackSpeed);
      });
    };

    this.log.debug(`spider.scanAsUser is about to receive the following arguements: contextId: "${contextId}", userId: "${userId}", sutBaseUrl: "${this.baseUrl}", maxChildren: "${maxChildren}".`, { tags: [`pid-${process.pid}`, this.#fileName, methodName] });

    // Technically doesn't need to be as user as we're using forced user mode.
    // Breaking API definitions up into their routes doesn't work very well because we don't have post data, so we could only exercise the GET methods.
    // ZAP will run the (enabled) passive scan rules against all URLs that are either proxied through ZAP or visited by either of the spiders: https://stackoverflow.com/questions/35942385/passive-scan-in-owasp-zap
    await this.zAp.aPi.spider.scanAsUser({ contextId, userId, url: this.baseUrl, maxChildren, recurse, subtreeOnly })
      .then(zapApiSpiderScanAsUser)
      .catch((err) => {
        const errorText = `Error occurred in spider while attempting to scan as user. Error was: ${err.message ? err.message : err}`;
        this.publisher.pubLog({ testSessionId, logLevel: 'error', textData: errorText, tagObj: { tags: [`pid-${process.pid}`, this.#fileName, methodName] } });
        throw new Error(errorText);
      });

    const startScanOf = {
      baseUrl: async () => {
        scanTargetIdForAscanCallback = this.baseUrl;
        sutAttackUrl = this.baseUrl;
        this.publisher.pubLog({ testSessionId, logLevel: 'info', textData: `About to ascan: "${sutAttackUrl}". The contextId is: ${contextId}`, tagObj: { tags: [`pid-${process.pid}`, this.#fileName, methodName] } });
        // inScopeOnly is ignored if a contextId is specified.
        await this.zAp.aPi.ascan.scan({ url: sutAttackUrl, recurse, inScopeOnly: false, scanPolicyName: '', method: '', postData: '', contextId }) // eslint-disable-line no-await-in-loop
          .then(zapApiAscanScanPerRoute)
          .catch((err) => { // eslint-disable-line no-loop-func
            const errorText = `Error occurred while attempting to initiate active scan of target: "${sutAttackUrl}". Error was: ${err.message ? err.message : err}`;
            this.publisher.pubLog({ testSessionId, logLevel: 'error', textData: errorText, tagObj: { tags: [`pid-${process.pid}`, this.#fileName, methodName] } });
            throw new Error(errorText);
          });
      }
    };
    await startScanOf.baseUrl();

    this.zAp.numberOfAlertsForSesh(numberOfAlertsForSesh);
  }
}

module.exports = ApiStandard;
