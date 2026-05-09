'use strict';

const http = require('http');
const Homey = require('homey');

const DXS_FAST = {
  measure_power_solar: 67109120,
  measure_frequency: 67110400,
  measure_voltage: 67109378,
  measure_current: 67109377,
  measure_power_l1: 67109379,
  measure_voltage_l2: 67109634,
  measure_current_l2: 67109633,
  measure_power_l2: 67109635,
  measure_voltage_l3: 67109890,
  measure_current_l3: 67109889,
  measure_power_l3: 67109891
};

const DXS_SLOW = {
  meter_power: 251658753,
  inverter_name: 16777984,
  serial_number: 16777728,
  firmware_version: 16779265,
  operating_status: 16780032
};

class KostalPikoDevice extends Homey.Device {
  async onInit() {
    this._fastInterval = null;
    this._slowInterval = null;
    this._isPolling = false;
    this._failureCount = 0;

    await this._ensureCapabilities();

    await this._startPolling();
    this.log('Kostal PIKO device initialized');
  }

  async _ensureCapabilities() {
    const required = [
      'measure_power_solar',
      'meter_power',
      'measure_power_l1',
      'measure_power_l2',
      'measure_power_l3',
      'measure_voltage',
      'measure_voltage_l2',
      'measure_voltage_l3',
      'measure_current',
      'measure_current_l2',
      'measure_current_l3',
      'alarm_generic'
    ];

    for (const capabilityId of required) {
      if (!this.hasCapability(capabilityId)) {
        try {
          await this.addCapability(capabilityId);
        } catch (error) {
          this.error(`Failed to add capability ${capabilityId}:`, error.message);
        }
      }
    }

    // Remove deprecated capabilities
    const deprecated = ['measure_power'];
    for (const capabilityId of deprecated) {
      if (this.hasCapability(capabilityId)) {
        try {
          await this.removeCapability(capabilityId);
          this.log(`Removed deprecated capability: ${capabilityId}`);
        } catch (error) {
          this.error(`Failed to remove capability ${capabilityId}:`, error.message);
        }
      }
    }
  }

  async onDeleted() {
    this._stopPolling();
  }

  async onSettings({ changedKeys }) {
    if (
      changedKeys.includes('host')
      || changedKeys.includes('fast_poll_seconds')
      || changedKeys.includes('slow_poll_seconds')
      || changedKeys.includes('request_timeout_ms')
      || changedKeys.includes('max_failures_before_unavailable')
    ) {
      this._stopPolling();
      await this._startPolling();
    }
  }

  _stopPolling() {
    if (this._fastInterval) {
      this.homey.clearInterval(this._fastInterval);
      this._fastInterval = null;
    }

    if (this._slowInterval) {
      this.homey.clearInterval(this._slowInterval);
      this._slowInterval = null;
    }
  }

  async _startPolling() {
    const fastSeconds = this.getSetting('fast_poll_seconds') || 15;
    const slowSeconds = this.getSetting('slow_poll_seconds') || 60;

    await this._pollFast();
    await this._pollSlow();

    this._fastInterval = this.homey.setInterval(async () => {
      await this._pollFast();
    }, fastSeconds * 1000);

    this._slowInterval = this.homey.setInterval(async () => {
      await this._pollSlow();
    }, slowSeconds * 1000);
  }

  async _pollFast() {
    await this._pollAndApply(Object.values(DXS_FAST), 'fast');
  }

  async _pollSlow() {
    await this._pollAndApply(Object.values(DXS_SLOW), 'slow');
  }

  async _pollAndApply(dxsIds, pollType) {
    if (this._isPolling) {
      return;
    }

    this._isPolling = true;

    try {
      const payload = await this._getDxsValues(dxsIds);
      await this._applyPayload(payload, pollType);
      this._failureCount = 0;
      await this.setAvailable().catch(() => {});
      await this.setCapabilityValue('alarm_generic', false).catch(() => {});
    } catch (error) {
      this._failureCount += 1;
      const limit = this.getSetting('max_failures_before_unavailable') || 3;

      this.error(`Polling failed (${pollType}):`, error.message);

      if (this._failureCount >= limit) {
        await this.setCapabilityValue('alarm_generic', true).catch(() => {});
        await this.setUnavailable(`Kostal API unreachable: ${error.message}`).catch(() => {});
      }
    } finally {
      this._isPolling = false;
    }
  }

  _buildQuery(dxsIds) {
    const parts = [];
    for (const id of dxsIds) {
      parts.push(`dxsEntries=${encodeURIComponent(id)}`);
    }
    return parts.join('&');
  }

  async _getDxsValues(dxsIds) {
    const host = this.getSetting('host');
    const timeout = this.getSetting('request_timeout_ms') || 5000;
    const path = `/api/dxs.json?${this._buildQuery(dxsIds)}`;

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host,
          port: 80,
          path,
          method: 'GET',
          timeout
        },
        (res) => {
          let raw = '';

          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            raw += chunk;
          });

          res.on('end', () => {
            try {
              const json = JSON.parse(raw);
              if (!json || !Array.isArray(json.dxsEntries)) {
                reject(new Error('Invalid dxs payload'));
                return;
              }
              resolve(json);
            } catch (e) {
              reject(new Error(`Invalid JSON response: ${e.message}`));
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy(new Error('Request timeout'));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    });
  }

  _extractValue(payload, dxsId) {
    const found = payload.dxsEntries.find((entry) => Number(entry.dxsId) === Number(dxsId));
    return found ? found.value : null;
  }

  async _applyPayload(payload, pollType) {
    if (pollType === 'fast') {
      await this._setNumberCapability('measure_power_solar', this._extractValue(payload, DXS_FAST.measure_power_solar));
      await this._setNumberCapability('measure_frequency', this._extractValue(payload, DXS_FAST.measure_frequency));
      await this._setNumberCapability('measure_voltage', this._extractValue(payload, DXS_FAST.measure_voltage));
      await this._setNumberCapability('measure_current', this._extractValue(payload, DXS_FAST.measure_current));
      await this._setNumberCapability('measure_power_l1', this._extractValue(payload, DXS_FAST.measure_power_l1));
      await this._setNumberCapability('measure_voltage_l2', this._extractValue(payload, DXS_FAST.measure_voltage_l2));
      await this._setNumberCapability('measure_current_l2', this._extractValue(payload, DXS_FAST.measure_current_l2));
      await this._setNumberCapability('measure_power_l2', this._extractValue(payload, DXS_FAST.measure_power_l2));
      await this._setNumberCapability('measure_voltage_l3', this._extractValue(payload, DXS_FAST.measure_voltage_l3));
      await this._setNumberCapability('measure_current_l3', this._extractValue(payload, DXS_FAST.measure_current_l3));
      await this._setNumberCapability('measure_power_l3', this._extractValue(payload, DXS_FAST.measure_power_l3));
      return;
    }

    await this._setNumberCapability('meter_power', this._extractValue(payload, DXS_SLOW.meter_power));

    const metadata = {
      inverterName: this._extractValue(payload, DXS_SLOW.inverter_name),
      serialNumber: this._extractValue(payload, DXS_SLOW.serial_number),
      firmwareVersion: this._extractValue(payload, DXS_SLOW.firmware_version),
      operatingStatus: this._extractValue(payload, DXS_SLOW.operating_status),
      lastUpdate: new Date().toISOString()
    };

    await this.setStoreValue('metadata', metadata).catch(() => {});
  }

  async _setNumberCapability(capabilityId, rawValue) {
    if (!this.hasCapability(capabilityId)) {
      return;
    }

    if (rawValue === null || rawValue === undefined || Number.isNaN(Number(rawValue))) {
      return;
    }

    const rounded = Math.round(Number(rawValue) * 1000) / 1000;
    await this.setCapabilityValue(capabilityId, rounded);
  }
}

module.exports = KostalPikoDevice;
