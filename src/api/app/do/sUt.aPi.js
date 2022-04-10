// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

import { object, string, number, array, boolean } from 'joi';
import Sut from './sUt';
/* eslint-disable import/no-dynamic-require */

// Strategies.

/* eslint-enable import/no-dynamic-require */

class Api extends Sut {
  #configSchemaProps;
  #sutSchema;
  // Strategies specific to Api.
  // ...

  #createSchema() {
    this.#sutSchema = object({
      sUtType: string().required().valid('Api'),
      protocol: string().required().valid('https', 'http'),
      ip: string().hostname().required(),
      port: number().port().required(),
      // eslint-disable-next-line no-underscore-dangle
      browser: string().valid(...this.#configSchemaProps.sut._cvtProperties.browser.format).lowercase().default(this.config.get('sut.browser')), // Todo: Remove once selenium containers are removed.
      loggedInIndicator: string(),
      loggedOutIndicator: string(),
      context: object({ // Zap context
        id: number().integer().positive(), // Provided by Zap.
        name: string().token() // Created in the app.js model.
      }),
      userId: number().integer().positive(), // Provided by Zap.
      authentication: object({
        emissaryAuthenticationStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('MaintainJwt'),
        route: string().min(2).regex(/^\/[-?&=\w/]{1,1000}$/)
      }),
      testSession: object({
        type: string().valid('appScanner').required(),
        id: string().regex(/^\w[-\w]{1,200}$/).required(),
        attributes: object({
          sitesTreePopulationStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('ImportUrls'),
          spiderStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('Standard'),
          scannersStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('ApiStandard'),
          scanningStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('ApiStandard'),
          postScanningStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('ApiStandard'),
          reportingStrategy: string().min(2).regex(/^[-\w/]{1,200}$/).default('Standard'),
          reports: object({ templateThemes: array().items(object({ name: string().min(1).max(100).regex(/^[a-z0-9]+/i).required() })).required() }),
          username: string().min(2).required(),
          openApi: object({
            importFileContentBase64: string().base64({ paddingRequired: true }),
            importUrl: string().uri({ scheme: ['https', 'http'], domain: { allowUnicode: false } })
          }).xor('importFileContentBase64', 'importUrl'),
          soap: object({
            importFileContentBase64: string().base64({ paddingRequired: true }),
            importUrl: string().uri({ scheme: ['https', 'http'], domain: { allowUnicode: false } })
          }).xor('importFileContentBase64', 'importUrl'),
          graphQl: object({
            importFileContentBase64: string().base64({ paddingRequired: true }),
            importUrl: string().uri({ scheme: ['https', 'http'], domain: { allowUnicode: false } }),
            maxQueryDepth: number().integer().positive(), // Zaproxy default: 5
            maxArgsDepth: number().integer().positive(), // Zaproxy default: 5
            optionalArgsEnabled: boolean().default(true), // Zaproxy default: true
            argsType: string().valid('INLINE', 'VARIABLES', 'BOTH'), // Zaproxy default: 'BOTH'
            querySplitType: string().valid('LEAF', 'ROOT_FIELD', 'OPERATION'), // Zaproxy default: 'LEAF'
            requestMethod: string().valid('POST_JSON', 'POST_GRAPHQL', 'GET') // Zaproxy default: 'POST_JSON'
          }).xor('importFileContentBase64', 'importUrl'),
          importUrls: object({ importFileContentBase64: string().base64({ paddingRequired: true }).required() }),
          aScannerAttackStrength: string().valid(...this.#configSchemaProps.sut._cvtProperties.aScannerAttackStrength.format).uppercase().default(this.config.get('sut.aScannerAttackStrength')), // eslint-disable-line no-underscore-dangle
          aScannerAlertThreshold: string().valid(...this.#configSchemaProps.sut._cvtProperties.aScannerAlertThreshold.format).uppercase().default(this.config.get('sut.aScannerAlertThreshold')), // eslint-disable-line no-underscore-dangle
          alertThreshold: number().integer().min(0).max(1000).default(this.config.get('sut.alertThreshold')),
          excludedRoutes: array().items(string()).default([])
        }).xor('openApi', 'graphQl', 'soap', 'importUrls')
      })
    }).xor('loggedInIndicator', 'loggedOutIndicator');
  }

  async #selectStrategies() {
    super.selectStrategies();
  }

  async initialise() { // eslint-disable-line class-methods-use-this
    // Todo: Populate as required.
  }

  constructor({ log, publisher, sutProperties }) {
    super({ log, publisher });
    this.#configSchemaProps = this.config.getSchema()._cvtProperties; // eslint-disable-line no-underscore-dangle
    this.#createSchema();
    this.initialiseProperties(sutProperties, this.#sutSchema);
    this.#selectStrategies();
  }

  getSitesTreeSutAuthenticationPopulationStrategy() {
    throw new Error(`Method "getSitesTreeSutAuthenticationPopulationStrategy()" is not applicable to SUT ${this.constructor.name}'s'`);
  }

  getSitesTreePopulationStrategy() {
    return {
      ...super.getSitesTreePopulationStrategy(),
      args: {
        log: this.log,
        publisher: this.publisher,
        baseUrl: this.baseUrl(),
        sutPropertiesSubSet: this.getProperties(['testSession', 'context']),
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
        sutPropertiesSubSet: this.getProperties(['testSession', 'context', 'userId'])
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

export default Api;
