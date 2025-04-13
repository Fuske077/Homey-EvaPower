'use strict';
const Homey = require('homey');
const axios = require('axios');
const utils = require('./utils');

class InverterDevice extends Homey.Device {

  async onInit() {
    this.log('InverterDevice has been initialized');
    this.sysSn = this.getSetting('sysSn');
    this.refreshInterval = this.getSetting('interval') < 10 ? 10 : this.getSetting('interval');

    this.appId = this.homey.settings.get('appId');
    this.appSecret = this.homey.settings.get('appSecret');
    this.realtimeDataUrl = `https://openapi.alphaess.com/api/getLastPowerData?sysSn=${this.sysSn}`;

    // Prepare persistent storage
    this.store = this.homey.storage;

    this.startPolling();
  }

  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.refreshInterval = newSettings.interval < 10 ? 10 : newSettings.interval;
    this.startPolling();
  }

  startPolling() {
    if (this.pollingTask) clearInterval(this.pollingTask);
    this.pollingTask = setInterval(() => {
      this.fetchData();
    }, this.refreshInterval * 1000);
  }

  async fetchData() {
    if (!this.appId || !this.appSecret || !this.sysSn) {
      this.log('Missing configuration: appId, appSecret, or sysSn');
      return;
    }

    this.timestamp = Math.floor(Date.now() / 1000);
    this.hash = utils.generateHash(this.appId, this.appSecret, this.timestamp);

    const headers = {
      'appId': this.appId,
      'timeStamp': this.timestamp,
      'sign': this.hash
    };

    try {
      const response = await axios.get(this.realtimeDataUrl, { headers });
      const data = response.data;

      const soc = data.data.soc;
      const vermogenAccu = data.data.pbat;
      const vermogenGrid = data.data.pgrid;

      await this.setCapabilityValue('measure_power', data.data.pload);
      await this.setCapabilityValue('measure_battery', soc);
      await this.setCapabilityValue('measure_battery_level', soc);
      await this.setCapabilityValue('measure_pv_power', data.data.ppv);
      await this.setCapabilityValue('measure_bat_power', vermogenAccu * -1);
      await this.setCapabilityValue('measure_grid_power', vermogenGrid);

      await this.fetchDailySummary(headers, soc);

      // === Berekeningen tijd tot vol / leeg ===
      const vermogenIn = vermogenGrid > 0 ? vermogenGrid : 0;
      const vermogenUit = vermogenAccu < 0 ? Math.abs(vermogenAccu) : 0;

      const capaciteit = this.getSetting('accuCapacity') || 2;
      const minSoc = 10;
      const maxSoc = 100;

      const energieTotLeeg = ((soc - minSoc) / 100) * capaciteit * 1000;
      const energieTotVol = ((maxSoc - soc) / 100) * capaciteit * 1000;

      const tijdTotLeeg = vermogenUit > 0 ? Math.round((energieTotLeeg / vermogenUit) * 10) / 10 : null;
      const tijdTotVol = vermogenIn > 0 ? Math.round((energieTotVol / vermogenIn) * 10) / 10 : null;

      await this.setCapabilityValue('measure_time_to_empty', tijdTotLeeg || 0);
      await this.setCapabilityValue('measure_time_to_full', tijdTotVol || 0);

    } catch (error) {
      this.error('Failed to fetch data:', error);
    }
  }

  async fetchDailySummary(headers, currentSoc) {
    try {
      const response = await axios.get('https://openapi.alphaess.com/api/getSumDataForCustomer', {
        headers,
        params: { sysSn: this.sysSn }
      });

      const summary = response.data.data;
      if (summary) {
        const geladen = summary.echarge;
        const ontladen = summary.edischarge;

        await this.setCapabilityValue('measure_echarge', geladen);
        await this.setCapabilityValue('measure_edischarge', ontladen);

        // === Dagelijks rendement berekening ===
        const capaciteit = this.getSetting('accuCapacity') || 2;

        // Lees socStart uit storage
        const socStart = this.store.get('socStart') ?? currentSoc;
        const socEind = currentSoc;

        // Update soc voor volgende cyclus
        this.store.set('socStart', socEind);

        const deltaSocKWh = ((socEind - socStart) / 100) * capaciteit * 0.9;

        const rendement = geladen > 0
          ? ((ontladen + deltaSocKWh) / geladen) * 100
          : 0;

        await this.setCapabilityValue('measure_rendement_day', Math.round(rendement * 100) / 100);
      }
    } catch (error) {
      this.error('Failed to fetch daily summary:', error.message);
    }
  }

  onDeleted() {
    clearInterval(this.pollingTask);
    this.log('InverterDevice has been deleted');
  }
}

module.exports = InverterDevice;
