/*
  Example how to send data using the Quectel BG96 modem and built-in MQTT client

  Note: If you have chosen to upload the code to RAM (default) in the Espruino IDE, you need
        to interactively call "onInit();" on the device's JavaScript console after uploading.

        Debug output to console can be controlled via variable connection_options.debug


  Copyright (C) 2019  Wolfgang Klenk <wolfgang.klenk@gmail.com>

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.

*/

var at;
var bme280;
var telemetryInterval;

// NB1 connectivity settings for 1NCE
/*
var connection_options = {
  band: "B8",
  apn: "iot.1nce.net",
  operator: "26201",
  debug: true
};
*/

// NB1 connectivity settings for Vodafone Germany
var connection_options = {
  band: "B20",
  apn: "vgesace.nb.iot",
  operator: "26202",
  debug: true // Print communication with BG96 module to console.
};

var mqtt_options = {
  server: 'mqtt.mydevices.com',
  port: 1883,
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

sendAtCommand = function (command, timeoutMs, waitForLine) {
  return new Promise((resolve, reject) => {

    var answer = "";
    at.cmd(command + "\r\n", timeoutMs || 1E3, function processResponse(response) {
      if (undefined === response || "ERROR" === response || response.startsWith("+CME ERROR")) {
        reject(response ? (command + ": " + response) : (command + ": TIMEOUT"));
      } else if (waitForLine ? (response.startsWith(waitForLine)) : ("OK" === response)) {
        resolve(waitForLine ? response : answer);
      } else {
        answer += (answer ? "\n" : "") + response;
        return processResponse;
      }
    });
  });
};

sendAtCommandAndWaitForPrompt = function (command, timeoutMs, sendLineAfterPrompt, waitForLine) {
  return new Promise((resolve, reject) => {

    var prompt = '> ';
    var answer = "";

    if (sendLineAfterPrompt) {
      at.register(prompt, (line) => {
        at.unregister(prompt);
        at.write(sendLineAfterPrompt + '\x1A');
        return line.substr(2);
      });
    }

    at.cmd(command + "\r\n", timeoutMs, function processResponse(response) {
      if (undefined === response || "ERROR" === response || response.startsWith("+CME ERROR")) {
        // Unregister the prompt '> ' in case something went wrong.
        // If we don't, we get follow up errors when it is tried to again register the prompt.
        at.unregister(prompt);

        reject(response ? (command + ": " + response) : (command + ": TIMEOUT"));
      } else if (waitForLine ? (response.startsWith(waitForLine)) : ("OK" === response)) {
        resolve(waitForLine ? response : answer);
      } else {
        answer += (answer ? "\n" : "") + response;
        return processResponse;
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
    .then(() => sendAtCommand('ATE0'))
    .then(() => sendAtCommand('AT+CPIN?')) // Fails on locked PIN
    .then(() => {
      var band_value = band_values[connection_options.band];
      if (undefined === band_value) throw("Unknown band: " + connection_options.band);

      return sendAtCommand('AT+QCFG="band",0,0,' + band_value + ',1');
    })
    .then(() => sendAtCommand('AT+QCFG="nwscanmode",3,1')) // Network Search Mode, LTE only
    .then(() => sendAtCommand('AT+QCFG="nwscanseq",030102,1')) // Network Search Sequence, NB-Iot, GSM, CatM1
    .then(() => sendAtCommand('AT+QCFG="iotopmode",1,1')) // LTE Search Mode: NB-IoT only
    .then(() => sendAtCommand('AT+QCFG="servicedomain",1,1')) // Set PS domain, PS only
    .then(() => sendAtCommand('AT+CGDCONT=1,"IP",' + JSON.stringify(connection_options.apn)))
    .then(() => sendAtCommand('AT+CFUN=1'))
    // Manually register to network.
    // Modem LED should flash on-off-off-off periodically to indicate network search
    .then(() => sendAtCommand('AT+COPS=1,2,' + JSON.stringify(connection_options.operator) + ',9', 1800000))
    // Open a network for MQTT client
    .then(() => sendAtCommand(
        'AT+QMTOPEN=0,' + JSON.stringify(mqtt_options.server) + ',' + mqtt_options.port,
        5000,
        '+QMTOPEN:'))
    .then((line) => {
      if (connection_options.debug) console.log("+QMTOPEN line:", line);

      // Connect this client to MQTT server
      return sendAtCommand('AT+QMTCONN=0,'
        + JSON.stringify(mqtt_options.client_id)
        + ','
        + JSON.stringify(mqtt_options.username)
        + ','
        + JSON.stringify(mqtt_options.password),
        5000,
        '+QMTCONN:');
    })
    .then((line) => {
      if (connection_options.debug) console.log("+QMTCONN line:", line);

      var qmtstat = '+QMTSTAT: ';
      at.unregisterLine(qmtstat);
      at.registerLine(qmtstat, (line) => {
        line = line.split(",");
        var errCode = line[1];

        if (connection_options.debug) console.log("+QMTSTAT reports error code:", errCode);
      });

      sendTelemetryData();
      telemetryInterval = setInterval(sendTelemetryData, 60000);
    });
}

// Publish telemetry data via MQTT
function sendTelemetryData() {
  var currentTemperature = bme280.getData().temp.toFixed(2);
  if (connection_options.debug) console.log("Current temperature: ", currentTemperature);

  sendAtCommandAndWaitForPrompt('AT+QMTPUB=0,0,0,0,'
    + JSON.stringify("v1/" + mqtt_options.username + "/things/" + mqtt_options.client_id + "/data/10"),
    5000,
    'temp,c=' + currentTemperature,
    '+QMTPUB:'
    )
    .then((line) => {
      if (connection_options.debug) console.log("+QMTPUB line:", line);
    });
}

function onInit() {
  Bluetooth.setConsole(true); // Don't want to have console on "Serial1" that is used for modem.
  setupExternalHardware(startDataLogger);
}



