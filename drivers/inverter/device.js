'use strict';
const Homey = require('homey');
const axios = require('axios');
const utils = require('./utils'); 

class InverterDevice extends Homey.Device {
	
  async onInit() {
    this.log('InverterDevice has been initialized');
    // create appropriate variables
    this.sysSn = this.getSetting('sysSn');
    this.refreshInterval = this.getSetting('interval') < 10 ? 10 : this.getSetting('interval'); // refresh interval in seconds minimum 10	

    this.appId = this.homey.settings.get('appId');
    this.appSecret = this.homey.settings.get('appSecret');
    this.realtimeDataUrl = `https://openapi.alphaess.com/api/getLastPowerData?sysSn=${this.sysSn}`; 
	
    // Start polling for data
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
      // 📡 Real-time power data
      const response = await axios.get(this.realtimeDataUrl, { headers });
      const data = response.data;
	  
      this.setCapabilityValue('measure_power', data.data.pload);
      this.setCapabilityValue('measure_battery', data.data.soc);
      this.setCapabilityValue('measure_pv_power', data.data.ppv);
      this.setCapabilityValue('measure_bat_power', data.data.pbat * -1); // make discharging negative
      this.setCapabilityValue('measure_grid_power', data.data.pgrid);

      // 🌅 NEW: Daily summary data
      await this.fetchDailySummary(headers);
	  
    } catch (error) {
      this.error('Failed to fetch data:', error);
    }
  }

  async fetchDailySummary(headers) {
    try {
      const response = await axios.get('https://openapi.alphaess.com/api/getSumDataForCustomer', {
        headers,
        params: { sysSn: this.sysSn }
      });

      const summary = response.data.data;
      if (summary) {
        this.setCapabilityValue('custom.echarge', summary.echarge);
        this.setCapabilityValue('custom.edischarge', summary.edischarge);
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
