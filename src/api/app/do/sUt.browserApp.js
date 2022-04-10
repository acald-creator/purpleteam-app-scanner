// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

import { object, string, number, array, boolean } from 'joi';
import Sut from './sUt';
/* eslint-disable import/no-dynamic-require */
const WebDriverFactory = require(`${process.cwd()}/src/drivers/webDriverFactory`);
const browser = require(`${process.cwd()}/src/clients/browser`);
// Strategies.
const sitesTreeSutAuthenticationPopulation = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/1_sitesTreeSutAuthenticationPopulation`);
/* eslint-enable import/no-dynamic-require */


class BrowserApp extends Sut {
  #configSchemaProps;
  #sutSchema;
  // Strategies specific to BrowserApp.
  #SitesTreeSutAuthenticationPopulation;

  #createSchema() {
    this.#sutSchema = object({
      sUtType: string().required().valid('BrowserApp'),
      protocol: string().required().valid('https', 'http'),
      ip: string().hostname().required(),
      port: number().port().required(),
      browser: string().valid(...this.#configSchemaProps.sut._cvtProperties.browser.format).lowercase().default(this.config.get('sut.browser')), // eslint-disable-line no-underscore-dangle
      loggedInIndicator: string(),
      loggedOutIndicator: string(),
      context: object({ // Zap context
        id: number().integer().positive(), // Provided by Zap.
        name: string().token() // Created in the app.js model.
      }),
      userId: number().integer().positive(), // Provided by Zap.
      authentication: object({
        sitesTreeSutAuthenticationPopulationStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('FormStandard'),
        emissaryAuthenticationStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('FormStandard'),
        route: string().min(2).regex(/^\/[-?&=\w/]{1,1000}$/),
        usernameFieldLocater: string().min(2),
        passwordFieldLocater: string().min(2),
        submit: string().min(2).regex(/^[a-z0-9_-]+/i),
        expectedPageSourceSuccess: string().min(2).max(200).required()
      }),
      testSession: object({
        type: string().valid('appScanner').required(),
        id: string().regex(/^\w[-\w]{1,200}$/).required(),
        attributes: object({
          sitesTreePopulationStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('WebDriverStandard'),
          spiderStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('Standard'),
          scannersStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('BrowserAppStandard'),
          scanningStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('BrowserAppStandard'),
          postScanningStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('BrowserAppStandard'),
          reportingStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('Standard'),
          reports: object({ templateThemes: array().items(object({ name: string().min(1).max(100).regex(/^[a-z0-9]+/i).required() })).required() }),
          username: string().min(2).required(),
          password: string().min(2),
          aScannerAttackStrength: string().valid(...this.#configSchemaProps.sut._cvtProperties.aScannerAttackStrength.format).uppercase().default(this.config.get('sut.aScannerAttackStrength')), // eslint-disable-line no-underscore-dangle
          aScannerAlertThreshold: string().valid(...this.#configSchemaProps.sut._cvtProperties.aScannerAlertThreshold.format).uppercase().default(this.config.get('sut.aScannerAlertThreshold')), // eslint-disable-line no-underscore-dangle
          alertThreshold: number().integer().min(0).max(1000).default(this.config.get('sut.alertThreshold')),
          excludedRoutes: array().items(string()).default([])
        }),
        relationships: object({
          data: array().items(object({
            type: string().valid('route').required(),
            id: string().min(2).regex(/^\/[-\w/]{1,200}$/).required()
          }))
        })
      }),
      testRoutes: array().items(object({
        type: string().valid('route').required(),
        id: string().min(2).regex(/^\/[-\w/]{1,200}$/).required(),
        attributes: object({
          attackFields: array().items(object({
            name: string().min(1).max(100).regex(/^[a-z0-9._-]+/i).required(),
            value: [string().empty('').default(''), boolean(), number()],
            visible: boolean()
          })),
          method: string().valid(...this.#configSchemaProps.sut._cvtProperties.method.format).uppercase().default(this.config.get('sut.method')), // eslint-disable-line no-underscore-dangle
          submit: string().min(2).regex(/^[a-z0-9_-]+/i)
        })
      }))
    }).xor('loggedInIndicator', 'loggedOutIndicator');
  }

  #selectStrategies() {
    this.#SitesTreeSutAuthenticationPopulation = sitesTreeSutAuthenticationPopulation[this.getProperties('authentication').sitesTreeSutAuthenticationPopulationStrategy];
    super.selectStrategies();
  }

  async initialise(emissaryProperties, selenium) {
    const { knownZapErrorsWithHelpMessageForBuildUser: knownZapFormatStringErrorsWithHelpMessageForBuildUser } = emissaryProperties;
    const webDriverFactory = new WebDriverFactory();
    this.log.debug(`selenium is: ${JSON.stringify(selenium)}`, { tags: [`pid-${process.pid}`, 'sUt.browserApp', 'initialise'] });
    const webDriver = await webDriverFactory.webDriver({
      log: this.log,
      selenium,
      browser: this.properties.browser,
      emissary: emissaryProperties,
      sutProtocol: this.properties.protocol
    });

    const getValuesOfSpecifiedSutPropertiesBasedOnPathAsArray = (pathDef, sutProps) => pathDef.reduce((accum, cV) => ((accum && accum[cV]) ? accum[cV] : null), sutProps);

    const replaceStringSubstitutionsWithSutPropertyValues = (message) => {
      const words = message.split(' ');
      const substitutions = words.filter((w) => w.startsWith('%'));
      const sutPropertyPaths = substitutions.map((w) => w.substring(1));
      const sutPropertyPathsAsArrays = sutPropertyPaths.map((s) => s.split('.'));
      const replacementValues = sutPropertyPathsAsArrays.map((s) => getValuesOfSpecifiedSutPropertiesBasedOnPathAsArray(s, this.properties));
      const wordsWithSubstitutionsReplaced = words.map((z) => (z.startsWith('%') ? replacementValues.shift() : z));
      return wordsWithSubstitutionsReplaced.join(' ');
    };

    const knownZapErrorsWithHelpMessageForBuildUser = knownZapFormatStringErrorsWithHelpMessageForBuildUser
      .map((k) => ({
        zapMessage: replaceStringSubstitutionsWithSutPropertyValues(k.zapMessage),
        helpMessageForBuildUser: replaceStringSubstitutionsWithSutPropertyValues(k.helpMessageForBuildUser)
      }));

    browser.init({ log: this.log, publisher: this.publisher, knownZapErrorsWithHelpMessageForBuildUser, webDriver });
  }

  constructor({ log, publisher, sutProperties }) {
    super({ log, publisher });
    this.#configSchemaProps = this.config.getSchema()._cvtProperties; // eslint-disable-line no-underscore-dangle
    this.#createSchema();
    this.initialiseProperties(sutProperties, this.#sutSchema);
    this.#selectStrategies();
  }

  getSitesTreeSutAuthenticationPopulationStrategy() {
    return {
      Strategy: this.#SitesTreeSutAuthenticationPopulation,
      args: {
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        browser,
        sutPropertiesSubSet: this.getProperties(['authentication', 'testSession'])
      }
    };
  }

  getSitesTreePopulationStrategy() {
    return {
      ...super.getSitesTreePopulationStrategy(),
      args: {
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        browser,
        sutPropertiesSubSet: this.getProperties(['testSession', 'context', 'testRoutes']),
        setContextId: (id) => { this.properties.context.id = id; }
      }
    };
  }

  getEmissaryAuthenticationStrategy() {
    return {
      ...super.getEmissaryAuthenticationStrategy(),
      args: {
        log: this.log,
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        sutPropertiesSubSet: this.getProperties(['authentication', 'loggedInIndicator', 'loggedOutIndicator', 'testSession', 'context']),
        setUserId: (id) => { this.properties.userId = id; }
      }
    };
  }

  getSpiderStrategy() {
    return {
      ...super.getSpiderStrategy(),
      args: {
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        sutPropertiesSubSet: this.getProperties('testSession')
      }
    };
  }

  getScannersStrategy() {
    return {
      ...super.getScannersStrategy(),
      args: {
        log: this.log,
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        sutPropertiesSubSet: this.getProperties('testSession')
      }
    };
  }

  getScanningStrategy() {
    return {
      ...super.getScanningStrategy(),
      args: {
        log: this.log,
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        sutPropertiesSubSet: this.getProperties(['testSession', 'testRoutes', 'context', 'userId'])
      }
    };
  }

  getPostScanningStrategy() {
    return {
      ...super.getPostScanningStrategy(),
      args: {
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        sutPropertiesSubSet: this.getProperties('testSession')
      }
    };
  }

  getReportingStrategy() {
    return {
      ...super.getReportingStrategy(),
      args: {
        log: this.log,
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        sutPropertiesSubSet: this.getProperties(['testSession', 'context'])
      }
    };
  }
}

export default BrowserApp;
