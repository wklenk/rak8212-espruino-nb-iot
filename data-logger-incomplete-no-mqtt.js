require("AT");

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

var mqtt_options = {
  // From Cayenne myDevices
  client_id: "8b4a0650-b9df-11e8-bf81-6b1a7e6fd7d2",
  username: "17ab1f60-df5e-11e7-8123-07faebe02555",
  password: "2776ac0e7b1ee6d84a59fe3295b9a9d0a73a7d08",
  keep_alive: 60
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

mqtt = require("MQTT").create("mqtt.mydevices.com", mqtt_options);

// As NB-IoT can be quite slow, we need to increase the connect timeout.
mqtt.C.CONNECT_TIMEOUT = 30000;

mqtt.on('ping_reply', function () {
  if (debug) console.log("MQTT: Ping reply");

  logTemperature();
  logPressure();
  logHumidity();
});

mqtt.on('error', function (message) {
  if (debug) console.log("MQTT: error:", message);
});

mqtt.on('connected', function () {
  if (debug) console.log("MQTT: Client connected.");
});

mqtt.on('disconnected ', function () {
  if (debug) console.log("MQTT: Disconnected.");
});


function logTemperature() {
  var topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/01";
  var message = "temp,c=" + bme280.getData().temp;
  mqtt.publish(topic, message);
}

function logPressure() {
  var topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/02";
  var message = "bp,hpa=" + bme280.getData().pressure;
  mqtt.publish(topic, message);
}

function logHumidity() {
  var topic = "v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/03";
  var message = "rel_hum,p=" + bme280.getData().humidity;
  mqtt.publish(topic, message);
}


function startDataLogger() {
  bg96nb1.openSocket(function (client) {
    if (debug) console.log("Socket connection to",
      connection_options.server,
      "port",
      connection_options.port,
      "established.");

    if (debug) console.log("Connecting MQTT Client ...");
    mqtt.connect(client);
  });
}

setupExternalHardware();

// This is called when the device boots up (or by calling "load();")
// Wiring to external hardware has to be set up.
function onInit() {
  setupExternalHardware();
}