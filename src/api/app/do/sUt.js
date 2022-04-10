// Copyright (C) 2017-2022 BinaryMist Limited. All rights reserved.

// Use of this software is governed by the Business Source License
// included in the file /licenses/bsl.md

// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0

/* eslint-disable import/no-dynamic-require */
const config = require(`${process.cwd()}/config/config`);
// Strategies.
const sitesTreePopulation = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/2_sitesTreePopulation`);
const emissaryAuthentication = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/3_emissaryAuthentication`);
const spider = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/4_spider`);
const scanners = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/5_scanners`);
const scanning = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/6_scanning`);
const postScanning = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/7_postScanning`);
const reporting = require(`${process.cwd()}/src/sUtAndEmissaryStrategies/8_reporting`);
/* eslint-enable import/no-dynamic-require */


class Sut {
  // Strategies.
  #SitesTreePopulation;
  #EmissaryAuthentication;
  #Spider;
  #Scanners;
  #Scanning;
  #PostScanning;
  #Reporting;

  constructor({ log, publisher }) {
    if (this.constructor === Sut) throw new Error('Abstract classes can\'t be instantiated.');
    this.log = log;
    this.publisher = publisher;
    this.config = config;
  }

  #validateProperties(sutProperties, schema) {
    const result = schema.validate(sutProperties);
    if (result.error) {
      this.log.error(result.error.message, { tags: ['sUt'] });
      throw new Error(result.error.message);
    }
    return result.value;
  }

  initialiseProperties(sutProperties, schema) {
    this.properties = this.#validateProperties(sutProperties, schema);
  }

  async initialise() {
    throw new Error(`Method "initialise()" of ${this.constructor.name} is abstract.`);
  }

  getProperties(selector) {
    if (typeof selector === 'string') return this.properties[selector];
    if (Array.isArray(selector)) return selector.reduce((accum, propertyName) => ({ ...accum, [propertyName]: this.properties[propertyName] }), {}); // Test that this is pointing to the right object.
    return this.properties;
  }

  selectStrategies() {
    this.#SitesTreePopulation = sitesTreePopulation[this.getProperties('testSession').attributes.sitesTreePopulationStrategy];
    this.#EmissaryAuthentication = emissaryAuthentication[this.getProperties('authentication').emissaryAuthenticationStrategy];
    this.#Spider = spider[this.getProperties('testSession').attributes.spiderStrategy];
    this.#Scanners = scanners[this.getProperties('testSession').attributes.scannersStrategy];
    this.#Scanning = scanning[this.getProperties('testSession').attributes.scanningStrategy];
    this.#PostScanning = postScanning[this.getProperties('testSession').attributes.postScanningStrategy];
    this.#Reporting = reporting[this.getProperties('testSession').attributes.reportingStrategy];
  }

  getSitesTreeSutAuthenticationPopulationStrategy() {
    throw new Error(`Method "getSitesTreeSutAuthenticationPopulationStrategy()" of ${this.constructor.name} is abstract.`);
  }

  getSitesTreePopulationStrategy() {
    return { Strategy: this.#SitesTreePopulation };
  }

  getEmissaryAuthenticationStrategy() {
    return { Strategy: this.#EmissaryAuthentication };
  }

  getSpiderStrategy() {
    return { Strategy: this.#Spider };
  }

  getScannersStrategy() {
    return { Strategy: this.#Scanners };
  }

  getScanningStrategy() {
    return { Strategy: this.#Scanning };
  }

  getPostScanningStrategy() {
    return { Strategy: this.#PostScanning };
  }

  getReportingStrategy() {
    return { Strategy: this.#Reporting };
  }

  // Zap Spider normalises port if it's a default port based on the protocol/scheme, so if the sut is listening on a default port, we remove it here.
  baseUrl() {
    return `${this.properties.protocol}://${this.properties.ip}${{ http: 80, https: 443 }[this.properties.protocol] === this.properties.port ? '' : `:${this.properties.port}`}`;
  }
}

export default Sut;
