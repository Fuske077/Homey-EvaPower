'use strict';

const Homey = require('homey');
const axios = require('axios');
const crypto = require('crypto');
const { InsightsLog } = require('homey');

class InverterDevice extends Homey.Device {
	
  async onInit() {
    this.log('InverterDevice has been initialized');
    //this.fetchinvdata()
    this.sysSn = this.getSetting('sysSn');
    this.refreshInterval = 10; // Default refresh interval in seconds	
	//this.registerCapability('measure_battery', 'BATTERY');
	//console.log(this.appId,this.appSecret,this.sysSn,this.hash)
	
	
	// Start polling for data
    this.startPolling();

  }
  
  
  async onSettings({oldSettings,newSettings, changedKeys}) {
    this.log('Settings changed:', newSettings);

    // Update instance variables with new settings
 //   this.appId = newSettings.appId;
 //   this.appSecret = newSettings.appSecret;
 //   this.sysSn = newSettings.sysSn;
  }
	generateHash(appId, appSecret, timestamp) {
		const data = `${appId}${appSecret}${timestamp}`;
		
		// Create a SHA-512 hash
		const hash = crypto.createHash('sha512').update(data).digest('hex');
		return hash;
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
	  

	this.appId = this.homey.settings.get('appId');
    this.appSecret = this.homey.settings.get('appSecret');
	    if (!this.appId || !this.appSecret || !this.sysSn) {
		//console.log(this.appId,this.appSecret,this.sysSn,this.hash)
      this.log('Missing configuration: appId, appSecret, or sysSn');
      return;
    }
	this.timestamp = Math.floor(Date.now() / 1000);
	this.hash = this.generateHash(this.appId, this.appSecret,this.timestamp);
    const url = `https://openapi.alphaess.com/api/getLastPowerData?sysSn=${this.sysSn}`;
    const headers = {
      'appId': this.appId,
	  'timeStamp':  this.timestamp,
	  'sign': this.hash
    };
	//console.log(headers,this.appSecret);
    try {
      const response = await axios.get(url, { headers });
      const data = response.data;
      //this.log('Data fetched successfully:', data);
      // Process the data here
      // Example: update capabilities or device state
      this.setCapabilityValue('measure_power', data.data.pload);
	  this.setCapabilityValue('measure_battery', data.data.soc);
	  this.setCapabilityValue('measure_pv_power', data.data.ppv);
	  this.setCapabilityValue('measure_bat_power', data.data.pbat*-1);
	  this.setCapabilityValue('measure_grid_power', data.data.pgrid);
      // Add additional capability updates as needed

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
