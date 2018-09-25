var bme280;
var bg96nb1;
var debug = true;

var connection_options = {
  server: 'mqtt.mydevices.com',
  port: 1883,
  band: "B8", // Deutsche Telekom / 1NCE
  apn: "iot.1nce.net",
  operator: "26201"
};


// Setup external hardware.
// This is also called by "onInit()" on reboot of the device
function setupExternalHardware(cb) {
  if (debug) console.log("Setting up external hardware. Please wait ...");
  // Setup wiring to BME280
  bme280 = require("iTracker").setEnvOn(true, function () {
    if (debug) console.log("BME280 wiring set up.");

    // Setup wiring to Quectel BG96
    require("iTracker").setCellOn(true, function (uart) {
      bg96nb1 = require('BG96NB1').connect(uart, connection_options);
      if (debug) console.log("Quectel BG96 wiring set up.");
    });
  });
}


function startDataLogger() {
  bg96nb1.openSocket(function (client) {
    if (debug) console.log("Socket connection to",
      connection_options.server,
      "port",
      connection_options.port,
      "established.");

    //if (debug) console.log("Connecting MQTT Client ...");
    //mqtt.connect(client);
  });
}

setupExternalHardware();

// This is called when the device boots up (or by calling "load();")
// Wiring to external hardware has to be set up.
function onInit() {
  setupExternalHardware();
}