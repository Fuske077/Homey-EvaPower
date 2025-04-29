'use strict';
const Homey = require('homey');
const axios = require('axios');
const utils = require('./utils');

class InverterDevice extends Homey.Device {

  async onInit() {
    this.log('EvaPower InverterDevice initialized');
    this.sysSn = this.getSetting('sysSn');
    this.refreshInterval = this.getSetting('interval') < 10 ? 10 : this.getSetting('interval');

    this.appId = this.homey.settings.get('appId');
    this.appSecret = this.homey.settings.get('appSecret');
    this.realtimeDataUrl = `https://openapi.alphaess.com/api/getLastPowerData?sysSn=${this.sysSn}`;

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
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();

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
      const vermogenGrid = data.data.pgrid;

      await this.setCapabilityValue('measure_battery', soc);
      await this.setCapabilityValue('measure_battery_level', soc);

      const gridCharge = vermogenGrid > 0 ? vermogenGrid : 0;
      const gridDischarge = vermogenGrid < 0 ? Math.abs(vermogenGrid) : 0;

      await this.setCapabilityValue('measure_grid_charge', gridCharge);
      await this.setCapabilityValue('measure_grid_discharge', gridDischarge);

      await this.fetchEMSStatus(headers); // 🆕 Nieuw toegevoegd

      await this.fetchDailySummary(headers, soc, hours === 23 && minutes === 59);

      if (hours === 0 && minutes === 0) {
        this.log('💾 SoC-start opgeslagen:', soc);
        await this.setStoreValue('socStart', soc);
      }

      const capaciteit = this.getSetting('accuCapacity') || 2;
      const minSoc = 10;
      const maxSoc = 100;

      const energieTotLeeg = ((soc - minSoc) / 100) * capaciteit * 1000;
      const energieTotVol = ((maxSoc - soc) / 100) * capaciteit * 1000;

      let tijdTotLeeg = 0;
      if (gridDischarge > 10) {
        tijdTotLeeg = Math.round((energieTotLeeg / gridDischarge) * 10) / 10;
      }

      let tijdTotVol = 0;
      if (gridCharge > 10) {
        tijdTotVol = Math.round((energieTotVol / gridCharge) * 10) / 10;
      }

      await this.setCapabilityValue('measure_time_to_empty', tijdTotLeeg);
      await this.setCapabilityValue('measure_time_to_full', tijdTotVol);

    } catch (error) {
      this.error('Failed to fetch data:', error);
    }
  }

  async fetchEMSStatus(headers) {
    try {
      const response = await axios.get('https://openapi.alphaess.com/api/getEssList', {
        headers
      });

      const listData = response.data.data;
      if (!listData || !Array.isArray(listData) || listData.length === 0) return;

      const matching = listData.find(item => item.sysSn === this.sysSn);
      if (!matching || !matching.emsStatus) return;

      await this.setCapabilityValue('status_ems', matching.emsStatus);
      this.log('🔌 EMS Status:', matching.emsStatus);

    } catch (error) {
      this.error('Failed to fetch EMS status:', error.message);
    }
  }

  async fetchDailySummary(headers, currentSoc, isScheduled = false) {
    this.log('📥 fetchDailySummary() gestart');

    try {
      const response = await axios.get('https://openapi.alphaess.com/api/getSumDataForCustomer', {
        headers,
        params: { sysSn: this.sysSn }
      });

      const summary = response.data.data;
      if (!summary) return;

      const geladen = summary.echarge || 0;
      const ontladen = summary.edischarge || 0;

      await this.setCapabilityValue('measure_echarge', geladen);
      await this.setCapabilityValue('measure_edischarge', ontladen);

      if (!isScheduled) return;

      const capaciteit = this.getSetting('accuCapacity') || 2;
      const socStart = await this.getStoreValue('socStart') ?? currentSoc;
      const socEind = currentSoc;

      await this.setStoreValue('socStart', socEind);
      this.log(`🔋 SoC start: ${socStart}`);
      this.log(`🔋 SoC eind: ${socEind}`);

      const deltaSocKWh = ((socEind - socStart) / 100) * capaciteit * 0.9;
      const rendement = geladen > 0 ? ((ontladen + deltaSocKWh) / geladen) * 100 : 0;
      const rendementRounded = Math.round(rendement * 100) / 100;

      await this.setCapabilityValue('measure_rendement_day', rendementRounded);

      const lifetimeEcharge = (await this.getStoreValue('lifetimeEcharge')) || 0;
      const lifetimeEdischarge = (await this.getStoreValue('lifetimeEdischarge')) || 0;

      const nieuweEcharge = lifetimeEcharge + geladen;
      const nieuweEdischarge = lifetimeEdischarge + ontladen;

      await this.setStoreValue('lifetimeEcharge', nieuweEcharge);
      await this.setStoreValue('lifetimeEdischarge', nieuweEdischarge);

      const potentieelWh = capaciteit * 1000 * (socEind / 100) * 0.9;
      const lifetimeRendement = nieuweEcharge > 0 ? ((nieuweEdischarge * 1000 + potentieelWh) / (nieuweEcharge * 1000)) * 100 : 0;

      await this.setCapabilityValue('measure_rendement_total', Math.round(lifetimeRendement * 100) / 100);

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
