const Homey = require("homey");
const axios = require('axios');
const utils = require('./utils');

class Driver extends Homey.Driver {
  // this method is called when the app is started and the Driver is inited

  // This method is called when a user is adding a device
  async onPairListDevices(data) {
    try {
      // Make an API call to fetch devices
      const devices = await this.fetchinvdata();
      // Map API response to Homey device objects
      const homeyDevices = devices.data.map(device => {
        return {
          name: device.minv,
          data: { id: device.sysSn },
          settings: {
            sysSn: device.sysSn
          }
        };
      });
      return homeyDevices;

    } catch (error) {
      this.log('Failed to list devices:', error);
      throw new Error('Failed to list devices');
    }
  }

	  
async fetchinvdata() {
	this.appId = this.homey.settings.get('appId');
    this.appSecret = this.homey.settings.get('appSecret');
	this.timestamp = Math.floor(Date.now() / 1000);

	const url = 'https://openapi.alphaess.com/api/getEssList';
	this.hash = utils.generateHash(this.appId, this.appSecret,this.timestamp);
	  const headers = {
      'appId': this.appId,
	  'timeStamp':  this.timestamp,
	  'sign': this.hash
    };
	try {
      const response = await axios.get(url, { headers });
      return response.data;
  }catch (error) {
      this.error('Failed to fetch data:', error);
    }}
	
	}
module.exports = Driver;