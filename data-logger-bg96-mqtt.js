/* Example how to send data using the Quectel BG96 modem and built-in MQTT client */

var at;
var bme280;
var telemetryInterval;

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
  debug: false // Print communication with BG96 module to console.
};

var mqtt_options = {
  // Personal credentials from Cayenne myDevices
  client_id: "d38d08e0-c3c1-11e8-bcb6-5d6527e66c38",
  username: "17ab1f60-df5e-11e7-8123-07faebe02555",
  password: "2776ac0e7b1ee6d84a59fe3295b9a9d0a73a7d08"
};


var band_values = {
  "B1": "1",
  "B2": "2",
  "B3": "4",
  "B4": "8",
  "B5": "10",
  "B8": "80",
  "B12": "800",
  "B13": "1000",
  "B18": "20000",
  "B19": "40000",
  "B20": "80000",
  "B26": "2000000",
  "B28": "8000000"
};

sendAtCommand = function (command, timeoutMs) {
  return new Promise(function (resolve, reject) {

    var answer = "";
    at.cmd(command + "\r\n", timeoutMs || 1E3, function processResponse(response) {
      if (undefined === response || "ERROR" === response || response.startsWith("+CME ERROR")) {
        reject(command + ": " + response ? response : "TIMEOUT");
      } else if ("OK" === response || "SEND OK" === response) {
        resolve(answer);
      } else {
        return answer += (answer ? "\n" : "") + response, processResponse;
      }
    });
  });
};

sendAtCommandAndWaitForLine = function (command, timeoutMs, lineBeginningToWaitFor, sendLineAfterPrompt) {
  return new Promise(function (resolve, reject) {

    var answer = "";

    if (sendLineAfterPrompt) {
      at.register('> ', function (line) {
        at.unregister('> ');
        at.write(sendLineAfterPrompt + '\x1A');
        return line.substr(2);
      });
    }

    at.unregisterLine(lineBeginningToWaitFor);
    at.registerLine(lineBeginningToWaitFor, function (line) {
      resolve(line);
    });

    at.cmd(command + "\r\n", timeoutMs, function processResponse(response) {
      if (undefined === response || "ERROR" === response || response.startsWith("+CME ERROR")) {
        reject(command + ": " + response ? response : "TIMEOUT");
      } else if ("OK" === response || "SEND OK" === response) {
        // Nothing td do.
      } else {
        return answer += (answer ? "\n" : "") + response, processResponse;
      }
    });
  });
};

// Setup external hardware.
// This is also called by "onInit()" on reboot of the device
function setupExternalHardware(cb) {
  if (connection_options.debug) console.log("Connecting Cellular Modem ...");
  require("iTracker").setCellOn(true, function (usart) {
    if (connection_options.debug) console.log("Cellular Modem connected.");
    at = require("AT").connect(usart);

    if (connection_options.debug) {
      at.debug(true);
    }

    bme280 = require("iTracker").setEnvOn(true, function () {
      if (connection_options.debug) console.log("BME280 wiring set up.");
      if (cb) cb();
    });
  });
}

function startDataLogger() {
  sendAtCommand('AT&F0')
    .then(function () {
      return sendAtCommand('ATE0');
    })
    .then(function () {
      return sendAtCommand('AT+CPIN?'); // Fails on locked PIN
    })
    .then(function () {
      var band_value = band_values[connection_options.band];
      if (undefined === band_value) throw("Unknown band: " + connection_options.band);

      return sendAtCommand('AT+QCFG="band",0,0,' + band_value + ',1');
    })
    .then(function () {
      return sendAtCommand('AT+QCFG="nwscanmode",3,1'); // Network Search Mode, LTE only
    })
    .then(function () {
      return sendAtCommand('AT+QCFG="nwscanseq",030102,1'); // Network Search Sequence, NB-Iot, GSM, CatM1
    })
    .then(function () {
      return sendAtCommand('AT+QCFG="iotopmode",1,1'); // LTE Search Mode: NB-IoT only
    })
    .then(function () {
      return sendAtCommand('AT+QCFG="servicedomain",1,1'); // Set PS domain, PS only
    })
    .then(function () {
      return sendAtCommand('AT+CGDCONT=1,"IP",' + JSON.stringify(connection_options.apn));
    })
    .then(function () {
      return sendAtCommand('AT+CFUN=1');
    })
    .then(function () {
      // Manually register to network.
      // Modem LED should flash on-off-off-off periodically to indicate network search
      return sendAtCommand('AT+COPS=1,2,' + JSON.stringify(connection_options.operator) + ',9', 1800000);
    })
    .then(function () {
      // Open a network for MQTT client
      return sendAtCommandAndWaitForLine(
        'AT+QMTOPEN=0,' + JSON.stringify(connection_options.server) + ',' + connection_options.port,
        5000,
        '+QMTOPEN:');
    })
    .then(function (line) {
      if (connection_options.debug) console.log("+QMTOPEN line:", line);

      // Connect this client to MQTT server
      return sendAtCommandAndWaitForLine('AT+QMTCONN=0,'
        + JSON.stringify(mqtt_options.client_id)
        + ','
        + JSON.stringify(mqtt_options.username)
        + ','
        + JSON.stringify(mqtt_options.password),
        5000,
        '+QMTCONN:');
    })
    .then(function (line) {
      if (connection_options.debug) console.log("+QMTCONN line:", line);

      sendTelemetryData();
      telemetryInterval = setInterval(sendTelemetryData, 60000);
    });

    /*
    .then(function () {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
            resolve();
          },
          60000);
      });
    })
    .then(function () {
      // Close network for MQTT client
      return sendAtCommand('AT+QMTCLOSE=0');
    })
    .then(function () {
      // Power down the BG96 module
      return sendAtCommand('AT+QPOWD');
    });
    */
}

// Publish telemetry data via MQTT
function sendTelemetryData() {
  sendAtCommandAndWaitForLine('AT+QMTPUB=0,0,0,0,'
    + JSON.stringify("v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/10"),
    5000,
    '+QMTPUB:',
    'temp,c=' + bme280.getData().temp.toFixed(2))

    .then(function (line) {
      if (connection_options.debug) console.log("+QMTPUB line:", line);
    });
}

function onInit() {
  Bluetooth.setConsole(true); // Don't want to have console on "Serial1" that is used for modem.
  setupExternalHardware(startDataLogger);
}



