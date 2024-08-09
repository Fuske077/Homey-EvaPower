'use strict';
const Homey = require('homey');
const axios = require('axios');
const utils = require('./utils');

class InverterDevice extends Homey.Device {
	
  async onInit() {
    this.log('InverterDevice has been initialized');
    // create approrpiate variables
    this.sysSn = this.getSetting('sysSn');
    this.refreshInterval = this.getSetting('interval') < 10 ? 10:this.getSetting('interval'); // refresh interval in seconds minimum 10	
	
	this.appId = this.homey.settings.get('appId');
    this.appSecret = this.homey.settings.get('appSecret');
    this.realtimeDataUrl = `https://openapi.alphaess.com/api/getLastPowerData?sysSn=${this.sysSn}`; 
	
	// Start polling for data
	this.startPolling();
  }
  
  
  async onSettings({oldSettings,newSettings, changedKeys}) {
	this.refreshInterval = newSettings.interval < 10 ? 10:newSettings.interval; // refresh interval in seconds minimum 10	
	this.startPolling();
  }
	
	  
  startPolling() {
    // Clear any existing intervals
    if (this.pollingTask) clearInterval(this.pollingTask);
    // Set up a new interval
    this.pollingTask = setInterval(() => {
      this.fetchData();
    }, this.refreshInterval * 1000);
  }


  async fetchData() {	  
	if (!this.appId || !this.appSecret || !this.sysSn) {
		this.log('Missing configuration: appId, appSecret, or sysSn');
		return;
    }
	// new timestamp to generate a hash
	this.timestamp = Math.floor(Date.now() / 1000);
	this.hash = utils.generateHash(this.appId, this.appSecret,this.timestamp);
    
    const headers = {
      'appId': this.appId,
	  'timeStamp':  this.timestamp,
	  'sign': this.hash
    };
    try {
      const response = await axios.get(this.realtimeDataUrl, { headers });
      const data = response.data;
      // Process the data here
      this.setCapabilityValue('measure_power', data.data.pload);
	  this.setCapabilityValue('measure_battery', data.data.soc);
	  this.setCapabilityValue('measure_pv_power', data.data.ppv);
	  this.setCapabilityValue('measure_bat_power', data.data.pbat*-1);//set the using of power from the battery to negative value.
	  this.setCapabilityValue('measure_grid_power', data.data.pgrid);
    } catch (error) {
      this.error('Failed to fetch data:', error);
    }
  }

  onDeleted() {
    // Clear the interval when the device is deleted
    clearInterval(this.pollingTask);
    this.log('InverterDevice has been deleted');
  }
}


module.exports = InverterDevice;
