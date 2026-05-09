'use strict';

const Homey = require('homey');

class KostalPikoDriver extends Homey.Driver {
  async onInit() {
    this.log('Kostal PIKO driver initialized');
  }

  async onPairListDevices() {
    return [
      {
        name: 'Kostal PIKO',
        data: {
          id: 'kostal-piko-local'
        }
      }
    ];
  }
}

module.exports = KostalPikoDriver;
