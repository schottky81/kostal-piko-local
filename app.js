'use strict';

const Homey = require('homey');

class KostalPikoApp extends Homey.App {
  async onInit() {
    this.log('Kostal PIKO Local app initialized');
  }
}

module.exports = KostalPikoApp;
