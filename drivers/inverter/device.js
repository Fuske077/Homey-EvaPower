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

      // Dagelijkse rendementberekening om 23:59
      if (hours === 23 && minutes === 59) {
        await this.fetchDailySummary(headers, soc);
      }

      // SoC-start van dag opslaan om 00:00
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

  async fetchDailySummary(headers, currentSoc) {
    try {
      this.log('📥 fetchDailySummary() gestart');
      const response = await axios.get('https://openapi.alphaess.com/api/getSumDataForCustomer', {
        headers,
        params: { sysSn: this.sysSn }
      });

      const summary = response.data.data;
      if (summary) {
        const geladen = summary.echarge;
        const ontladen = summary.edischarge;

        this.log('⚡ echarge (geladen vandaag):', geladen);
        this.log('⚡ edischarge (ontladen vandaag):', ontladen);

        await this.setCapabilityValue('measure_echarge', geladen || 0);
        await this.setCapabilityValue('measure_edischarge', ontladen || 0);

        const capaciteit = this.getSetting('accuCapacity') || 2;
        let socStart = await this.getStoreValue('socStart');
        if (socStart === undefined || socStart === null) {
          socStart = currentSoc;
        }
        const socEind = currentSoc;

        this.log('🔋 SoC start:', socStart);
        this.log('🔋 SoC eind:', socEind);

        await this.setStoreValue('socStart', socEind);

        const brutoDelta = socEind - socStart;
        const deltaSocKWh = brutoDelta > 0 ? (brutoDelta / 100) * capaciteit * 0.9 : 0;

        const dagrendement = geladen > 0
          ? ((ontladen + deltaSocKWh) / geladen) * 100
          : 0;

        const veiligDag = isNaN(dagrendement) ? 0 : Math.round(dagrendement * 100) / 100;
        await this.setCapabilityValue('measure_rendement_day', veiligDag);

        const som = await this.getStoreValue('rendementTotaalSom') || 0;
        const dagen = await this.getStoreValue('rendementAantalDagen') || 0;

        const nieuweSom = som + veiligDag;
        const nieuweDagen = dagen + 1;

        const gemiddeld = nieuweDagen > 0 ? nieuweSom / nieuweDagen : 0;

        await this.setStoreValue('rendementTotaalSom', nieuweSom);
        await this.setStoreValue('rendementAantalDagen', nieuweDagen);

        await this.setCapabilityValue('measure_rendement_total', Math.round(gemiddeld * 100) / 100);

        await this.setStoreValue('lastDailyCalc', today);
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
