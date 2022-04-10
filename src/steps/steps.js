// features/support/steps.js
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'assert';

// Cucumber expects a non arrow function in order for the this to refer to the world.
/* eslint-disable func-names */
Given('a variable set to {int}', function (number) {
  this.setTo(number);
});

When('I increment the variable by {int}', function (number) {
  this.incrementBy(number);
});

Then('the variable should contain {int}', function (number) {
  assert(this.variable === number);
});
/* eslint-enable func-names */
