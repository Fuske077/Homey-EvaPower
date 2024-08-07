const Homey = require("homey");
const axios = require('axios');
const crypto = require('crypto');

class Driver extends Homey.Driver {
  // this method is called when the app is started and the Driver is inited
//  async onInit() {
//    const showToastActionCard = this.homey.flow.getActionCard('show_toast');
  
    //showToastActionCard.registerRunListener(async ({ device, message }) => {
      //await device.createToast(message);
    //});
  //}
  
  // This method is called when a user is adding a device
  // and the 'list_devices' view is called
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
generateHash(appId, appSecret, timestamp) {
		const data = `${appId}${appSecret}${timestamp}`;
		
		// Create a SHA-512 hash
		const hash = crypto.createHash('sha512').update(data).digest('hex');
		return hash;
	  }
	  
async fetchinvdata() {
	this.appId = "alpha254904b33d125db5";
    this.appSecret = "6c5c8c5c36874572a1a99d45b82268ea";
	const url = 'https://openapi.alphaess.com/api/getEssList';
	this.timestamp = Math.floor(Date.now() / 1000);
	this.hash = this.generateHash(this.appId, this.appSecret,this.timestamp);
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