var bme280;
var bg96nb1;
var debug = false;
var flashingLedInterval;
var flashingLed = false;
var telemetryCounter = 0;
var errorStore = [];

// NB1 connectivity settings for 1NCE
/*
var connection_options = {
  server: 'mqtt.mydevices.com',
  port: 1883,
  band: "B8",
  apn: "iot.1nce.net",
  operator: "26201",
  debug: true
};
*/

// NB1 connectivity settings for Vodafone Germany
var connection_options = {
  server: 'mqtt.mydevices.com',
  port: 1883,
  band: "B20",
  apn: "vgesace.nb.iot",
  operator: "26202",
  debug: false
};

var mqtt_options = {
  // Personal credentials from Cayenne myDevices
  client_id: "d38d08e0-c3c1-11e8-bcb6-5d6527e66c38",
  username: "17ab1f60-df5e-11e7-8123-07faebe02555",
  password: "2776ac0e7b1ee6d84a59fe3295b9a9d0a73a7d08"
};

mqtt = require("MQTT").create("mqtt.mydevices.com", mqtt_options);

// Setup external hardware.
// This is also called by "onInit()" on reboot of the device
function setupExternalHardware(cb) {
  flashingLedInterval = setInterval("digitalWrite(LED1,flashingLed=!flashingLed);", 200);

  if (debug) console.log("Setting up external hardware. Please wait ...");
  // Setup wiring to Quectel BG96
  require("iTracker").setCellOn(true, function (uart) {
    bg96nb1 = require('BG96NB1').connect(uart, connection_options);
    if (debug) console.log("Quectel BG96 wiring set up.");
    clearInterval(flashingLedInterval);

    bme280 = require("iTracker").setEnvOn(true, function () {
      if (debug) console.log("BME280 wiring set up.");
      if (cb) cb();
    });
  });

}

mqtt.on('ping_reply', function () {
  if (debug) console.log("MQTT: Ping reply");

  if (telemetryCounter % 10 === 0) {
    logPacketDataCounters();
    logTemperature();
    logPressure();
    logHumidity();
  }

  telemetryCounter++;
});

mqtt.on('error', function (message) {
  if (debug) console.log('MQTT: Error:', message);
  errorStore.push('MQTT: Error ' + message);
});

mqtt.on('connected', function () {
  clearInterval(flashingLedInterval);
  if (debug) console.log("MQTT: Client connected.");

  //mqtt.subscribe("v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/cmd/04");
});

mqtt.on('publish', function (pub) {
  console.log("topic: " + pub.topic);
  console.log("message: " + pub.message);
});

mqtt.on('disconnected ', function () {
  if (debug) console.log('MQTT: Disconnected.');
  errorStore.push('MQTT: Disconnected.');
});

function logTemperature() {
  var topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/10";
  var message = "temp,c=" + bme280.getData().temp.toFixed(2);
  mqtt.publish(topic, message);
}

function logPressure() {
  var topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/11";
  var message = "bp,hpa=" + bme280.getData().pressure.toFixed(2);
  mqtt.publish(topic, message);
}

function logHumidity() {
  var topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/12";
  var message = "rel_hum,p=" + bme280.getData().humidity.toFixed(2);
  mqtt.publish(topic, message);
}

function logPacketDataCounters() {
  bg96nb1.getPacketDataCounter(function (bytesSent, bytesReceived) {

    var topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/13";
    var message = "counter,null=" + bytesSent;
    mqtt.publish(topic, message);

    topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/14";
    message = "counter,null=" + bytesReceived;
    mqtt.publish(topic, message);
  });
}


function startDataLogger() {
  flashingLedInterval = setInterval("digitalWrite(LED1,flashingLed=!flashingLed);", 500);
  bg96nb1.openSocket(function (client) {
    if (debug) console.log("Socket connection to",
      connection_options.server,
      "port",
      connection_options.port,
      "established.");

    clearInterval(flashingLedInterval);
    flashingLedInterval = setInterval("digitalWrite(LED1,flashingLed=!flashingLed);", 1000);

    if (debug) console.log("Connecting MQTT Client ...");
    mqtt.connect(client);
  });
}

// As NB-IoT can be quite slow, we need to increase the connect timeout.
mqtt.C.CONNECT_TIMEOUT = 30000;

// Deal with any uncaught exceptions
process.on('uncaughtException', function (err) {
  if (debug) console.log('Error', err);
  errorStore.push('Uncaught exception: ' + err);
});

function onInit() {
  Bluetooth.setConsole(true); // Don't want to have console on "Serial1" that is used for modem.
  setupExternalHardware(startDataLogger);
}
