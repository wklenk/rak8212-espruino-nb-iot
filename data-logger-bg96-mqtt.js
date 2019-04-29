/*
  Example how to send and receive data using the Quectel BG96 modem and built-in MQTT client.
  Uses a simple Finite State Machine to introduce robustness against communication errors.

  Note: If you have chosen to upload the code to RAM (default) in the Espruino IDE, you need
        to interactively call "onInit();" on the device's JavaScript console after uploading.

        Debug output to console can be controlled via variable connection_options.debug

        Cryptographical files for securing the MQTT connection must have been uploaded to the Quectel BG96
        module as files cert.pem, key.pem and cacert.pem before.

        Low memory is an issue!
        Use the "online minification" feature of the Espruino IDE if you run short on
        memory (e.g. "Closure (online))


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

var ENTERING_STATE = 'Entering State';
var ERROR_IN_STATE = 'Error in State';

var STATE_SETUP_EXTERNAL_HARDWARE = 'Setup External Hardware';
var STATE_CONFIGURE_MODEM = 'Configure Modem';
var STATE_REGISTER_TO_NETWORK = 'Register To Network';
var STATE_OPEN_MQTT_NETWORK =  'Open MQTT Network';
var STATE_CONNECT_TO_SERVER = 'Connect To Server';
var STATE_PUBLISH_TELEMETRY_DATA = 'Publish Telemetry Data';
var STATE_GET_CURRENT_STATE = 'Get Current State';
var STATE_SUBSCRIBE_TO_DELTA_UPDATES = "Subscribe To Delta Updates";
var STATE_SLEEP = 'Sleep';
var STATE_RESET_MODEM = 'Reset Modem';
var STATE_POWER_DOWN = 'Power Down';

var at;
var bme280;
var errCnt = 0;
var updateCnt = 1;
var smRestartCnt = 0;
var ledOn = false;
var qmtstat = 0;

var sm = require("StateMachine").FSM();

// NB1 connectivity settings for 1NCE
/*
var connection_options = {
  band: "B8",
  apn: "iot.1nce.net",
  operator: "26201",
  debug: false
};
*/

// NB1 connectivity settings for Vodafone Germany
var connection_options = {
  band: "B20",
  apn: "vgesace.nb.iot",
  operator: "26202",
  debug: false // Print communication with BG96 module to console.
};

var mqtt_options = {
  // AWS IoT
  server: 'a136ivuau4uklv-ats.iot.eu-central-1.amazonaws.com',
  port: 8883,
  client_id: "klenk-iot-device"
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

function controlLed(desiredLedState) {

  if (desiredLedState === 'off') {
    digitalWrite(LED1, false);
    ledOn = false;
  } else if (desiredLedState === 'on') {
    digitalWrite(LED1, true);
    ledOn = true;
  }
}

//
// Finite State Machine: States
//

// Setup external hardware.
function e_SetupExternalHardware() {
  console.log(ENTERING_STATE, STATE_SETUP_EXTERNAL_HARDWARE);

  return new Promise((resolve, reject) => {
    require("iTracker").setCellOn(true, (usart) => {
      resolve(usart);
    });
  })
    .then((usart) => {
      console.log("External modules connected.");
      at = require("AT").connect(usart);

      if (connection_options.debug) {
        at.debug(true);
      }

      return new Promise((resolve, reject) => {
        bme280 = require("iTracker").setEnvOn(true, () => {
          console.log("BME280 wiring set up.");
          resolve();
        });
      });
    })
    .then(() => {
      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_SETUP_EXTERNAL_HARDWARE, err);
      sm.signal('fail');
    });
}

// Configure BG96 module and MQTT software stack
function e_ConfigureModem() {
  console.log(ENTERING_STATE, STATE_CONFIGURE_MODEM);

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
    // Send keepalive message every 30 seconds
    .then(() => sendAtCommand('AT+QMTCFG="keepalive",0,30'))
    // SSL: Configure MQTT session into SSL mode
    .then(() => sendAtCommand('AT+QMTCFG="SSL",0,1,2'))
    // SSL: Configure trusted CA certificate
    .then(() => sendAtCommand('AT+QSSLCFG="cacert",2,"cacert.pem"'))
    // SSL: Configure client certificate
    .then(() => sendAtCommand('AT+QSSLCFG="clientcert",2,"cert.pem"'))
    // SSL: Configure private key
    .then(() => sendAtCommand('AT+QSSLCFG="clientkey",2,"key.pem"'))
    // SSL: Authentication mode: Server and client authentication
    .then(() => sendAtCommand('AT+QSSLCFG="seclevel",2,2'))
    // SSL: Authentication version. Accept all SSL versions
    .then(() => sendAtCommand('AT+QSSLCFG="sslversion",2,4'))
    // SSL: Cipher suite: Support all cipher suites
    .then(() => sendAtCommand('AT+QSSLCFG="ciphersuite",2,0xFFFF'))
    // SSL: Ignore the time of authentication.
    .then(() => sendAtCommand('AT+QSSLCFG="ignorelocaltime",1'))
    .then(() => {
      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_CONFIGURE_MODEM, err);
      sm.signal('fail');
    });
}

// Register to network
function e_RegisterToNetwork() {
  console.log(ENTERING_STATE, STATE_REGISTER_TO_NETWORK);
  // Manually register to network.
  // Modem LED should flash on-off-off-off periodically to indicate network search
  sendAtCommand('AT+COPS=1,2,' + JSON.stringify(connection_options.operator) + ',9', 1800000)
    .then(() => {
      sm.signal('ok');
    })
    .catch((err) => {
      console.log('Error in state', STATE_REGISTER_TO_NETWORK, err);
      sm.signal('fail');
    });
}

// Open a network for MQTT client
function e_OpenMQTTNetwork() {
  console.log(ENTERING_STATE, STATE_OPEN_MQTT_NETWORK);

  sendAtCommand(
    'AT+QMTOPEN=0,' + JSON.stringify(mqtt_options.server) + ',' + mqtt_options.port,
    30000,
    '+QMTOPEN:')
    .then((line) => {
      if (connection_options.debug) console.log("+QMTOPEN line:", line);

      var qmtstat = '+QMTSTAT: ';
      at.unregisterLine(qmtstat);
      at.registerLine(qmtstat, (line) => {
        line = line.split(",");
        qmtstat = parseInt(line[1]);

        console.log("+QMTSTAT Error Code:", qmtstat);
      });

      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_OPEN_MQTT_NETWORK, err);
      sm.signal('fail');
    });
}

// Connect this client to MQTT server
function e_ConnectToServer() {
  console.log(ENTERING_STATE, STATE_CONNECT_TO_SERVER);

  sendAtCommand('AT+QMTCONN=0,'
    + JSON.stringify(mqtt_options.client_id),
    15000,
    '+QMTCONN:')
    .then((line) => {
      if (connection_options.debug) console.log("+QMTCONN line:", line);

      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_CONNECT_TO_SERVER, err);
      sm.signal('fail');
    });
}

// Request the current state from the AWS IoT Device Shadow
function e_GetCurrentState() {
 console.log(ENTERING_STATE, STATE_GET_CURRENT_STATE);

  // Register line +QMTRECV: 0,1,"$aws/things/..."/shadow/get/accepted"
  var qmtrecv = '+QMTRECV: 0,1,' + JSON.stringify("$aws/things/" + mqtt_options.client_id + "/shadow/get/accepted");
  at.unregisterLine(qmtrecv);
  at.registerLine(qmtrecv, (line) => {
    var openingBrace = line.indexOf('{');

    console.log("+QMTRECV", line.split(",")[2], line.substr(openingBrace));
    var payloadJson = JSON.parse(line.substr(openingBrace));

    if (payloadJson.hasOwnProperty('state') && payloadJson.state.hasOwnProperty('desired') && payloadJson.state.desired.hasOwnProperty('led')) {
      controlLed(payloadJson.state.desired.led);
    }
  });

  // Subscribe to shadow/get/accepted
  sendAtCommand('AT+QMTSUB=0,1,'
    + JSON.stringify("$aws/things/" + mqtt_options.client_id + "/shadow/get/accepted")
    + ',1',
    15000,
    '+QMTSUB:')
    .then((line) => {
      if (connection_options.debug) console.log("+QMTSUB line:", line);

      // Publish empty message to shadow/get
      return sendAtCommandAndWaitForPrompt('AT+QMTPUB=0,1,1,0,'
        + JSON.stringify("$aws/things/" + mqtt_options.client_id + "/shadow/get"),
        15000,
        '{}',
        '+QMTPUB:'
      );
    })
    .then((line) => {
      if (connection_options.debug) console.log("+QMTPUB line:", line);

      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_CONNECT_TO_SERVER, err);
      sm.signal('fail');
    });
}


// Subscribe to AWS Device Shadow Delta Updates
// Will receive a message any time there is a difference between "desired" and "reported" led state.
function e_SubscribeToDeltaUpdates() {
  console.log(ENTERING_STATE, STATE_SUBSCRIBE_TO_DELTA_UPDATES);

  // Register line +QMTRECV: 0,1,"$aws/things/..."/shadow/get/accepted"
  var qmtrecv = '+QMTRECV: 0,1,' + JSON.stringify("$aws/things/" + mqtt_options.client_id + "/shadow/update/delta");
  at.unregisterLine(qmtrecv);
  at.registerLine(qmtrecv, (line) => {
    var openingBrace = line.indexOf('{');
    console.log("+QMTRECV", line.split(",")[2], line.substr(openingBrace));

    var payloadJson = JSON.parse(line.substr(openingBrace));

    if (payloadJson.hasOwnProperty('state') && payloadJson.state.hasOwnProperty('led')) {
      controlLed(payloadJson.state.led);
    }
  });

  // Subscribe to shadow/update/delta
  sendAtCommand('AT+QMTSUB=0,1,'
    + JSON.stringify("$aws/things/" + mqtt_options.client_id + "/shadow/update/delta")
    + ',1',
    15000,
    '+QMTSUB:')
    .then((line) => {
      if (connection_options.debug) console.log("+QMTSUB line:", line);
      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_SUBSCRIBE_TO_DELTA_UPDATES, err);
      sm.signal('fail');
    });
}


// Publish telemetry data via MQTT
function e_PublishTelemetryData() {
  console.log(ENTERING_STATE, STATE_PUBLISH_TELEMETRY_DATA);

  var currentTemperature = bme280.getData().temp.toFixed(2);
  console.log("Current temperature: ", currentTemperature);

  // Reported LED state
  var ledStateString = 'off';
  if (ledOn === true) {
    ledStateString = 'on';
  }

  var memory = process.memory();

  // AWS IoT Protocol
  sendAtCommandAndWaitForPrompt('AT+QMTPUB=0,1,1,0,'
    + JSON.stringify("$aws/things/" + mqtt_options.client_id + "/shadow/update"),
    5000,
    '{' +
    '"state" : {' +
    ' "reported" : {' +
    '  "temperature" : "' + currentTemperature + '",' +
    '  "led" : "' + ledStateString + '",' +
    '  "restarts" : ' + smRestartCnt + ',' +
    '  "updates" : ' + updateCnt + ',' +
    '  "memory" : {' +
    '   "free" : ' + memory.free + ',' +
    '   "usage" : ' + memory.usage + ',' +
    '   "total" : ' + memory.total + ',' +
    '   "history" : ' + memory.history + '' +
    '   }' +
    '  }' +
    ' }' +
    '}',
    '+QMTPUB:'
  )
    .then((line) => {
      if (connection_options.debug) console.log("+QMTPUB line:", line);

      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 5000);
      });
    })
    .then((line) => {
      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_PUBLISH_TELEMETRY_DATA, err);
      sm.signal('fail');
    });
}

function e_Sleep(result) {
  console.log(ENTERING_STATE, STATE_SLEEP);

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve();
    }, 60000);
  })
    .then(() => {
      sm.signal('ok');
    });
}

function e_ResetModem(result) {
  console.log(ENTERING_STATE, STATE_RESET_MODEM);

  sendAtCommand('AT+QPOWD', 10000, 'POWERED DOWN')
    .then(() => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, 10000);
      });
    })
    .then(() => {
      console.log('Powered down');
      sm.signal('ok');
    })
    .catch((err) => {
      console.log(ERROR_IN_STATE, STATE_RESET_MODEM, err);
      sm.signal('ok');
    });
}

//
// Finite State Machine: Transitions
//

function t_SetupExternalHardware(result) {
  return {state: STATE_CONFIGURE_MODEM};
}

function t_ConfigureModem(result) {
  return {state: STATE_REGISTER_TO_NETWORK};
}

function t_RegisterToNetwork(result) {
  switch(result) {
    case('ok'):
      return {state: STATE_OPEN_MQTT_NETWORK};

    default:
      return {state: STATE_RESET_MODEM};
  }
}

function t_OpenMQTTNetwork(result) {
  if (qmtstat > 0) {
    return {state: STATE_RESET_MODEM};
  }

  switch(result) {
    case('ok'):
      return {state: STATE_CONNECT_TO_SERVER};

    default:
      return {state: STATE_RESET_MODEM};
  }
}

function t_ConnectToServer(result) {
  if (qmtstat > 0) {
    return {state: STATE_RESET_MODEM};
  }

  switch(result) {
    case('ok'):
      return {state: STATE_GET_CURRENT_STATE};

    default:
      return {state: STATE_RESET_MODEM};
  }
}

function t_GetCurrentState(result) {
  if (qmtstat > 0) {
    return {state: STATE_RESET_MODEM};
  }

  switch(result) {
    case('ok'):
      return {state: STATE_SUBSCRIBE_TO_DELTA_UPDATES};

    default:
      return {state: STATE_RESET_MODEM};
  }
}

function t_SubscribeToDeltaUpdates(result) {
  if (qmtstat > 0) {
    return {state: STATE_RESET_MODEM};
  }

  switch(result) {
    case('ok'):
      return {state: STATE_PUBLISH_TELEMETRY_DATA};

    default:
      return {state: STATE_RESET_MODEM};
  }
}

function t_PublishTelemetryData(result) {
  if (qmtstat > 0) {
    return {state: STATE_RESET_MODEM};
  }

  switch(result) {
    case('ok'):
      errCnt = 0; // Reset error counter
      updateCnt++;
      return {state: STATE_SLEEP};

    default:
      errCnt++;
      if (errCnt >= 3) {
        errCnt = 0;
        return {state: STATE_RESET_MODEM};
      }
      else {
        return {state: STATE_SLEEP};
      }
  }
}

function t_Sleep(result) {
  if (qmtstat > 0) {
    return {state: STATE_RESET_MODEM};
  }

  return {state: STATE_PUBLISH_TELEMETRY_DATA};
}

function t_ResetModem(result) {
  return {state: STATE_POWER_DOWN};
}

function onInit() {
  Bluetooth.setConsole(true); // Don't want to have console on "Serial1" that is used for modem.

  sm.define({name: STATE_SETUP_EXTERNAL_HARDWARE, enter:e_SetupExternalHardware, signal:t_SetupExternalHardware});
  sm.define({name: STATE_CONFIGURE_MODEM, enter:e_ConfigureModem, signal:t_ConfigureModem});
  sm.define({name: STATE_REGISTER_TO_NETWORK, enter:e_RegisterToNetwork, signal:t_RegisterToNetwork});
  sm.define({name: STATE_OPEN_MQTT_NETWORK, enter:e_OpenMQTTNetwork, signal:t_OpenMQTTNetwork});
  sm.define({name: STATE_CONNECT_TO_SERVER, enter:e_ConnectToServer, signal:t_ConnectToServer});
  sm.define({name: STATE_GET_CURRENT_STATE, enter:e_GetCurrentState, signal:t_GetCurrentState});
  sm.define({name: STATE_SUBSCRIBE_TO_DELTA_UPDATES, enter:e_SubscribeToDeltaUpdates, signal:t_SubscribeToDeltaUpdates});
  sm.define({name: STATE_PUBLISH_TELEMETRY_DATA, enter:e_PublishTelemetryData, signal:t_PublishTelemetryData});
  sm.define({name: STATE_SLEEP, enter:e_Sleep, signal:t_Sleep});
  sm.define({name: STATE_RESET_MODEM, enter:e_ResetModem, signal:t_ResetModem});
  sm.define({name: STATE_POWER_DOWN});

  sm.init(STATE_SETUP_EXTERNAL_HARDWARE);

  // If the state machine is in state "Power Down", then restart the state machine.
  setInterval(() => {
    console.log("Checking state machine state");
    if (sm.state === STATE_POWER_DOWN) {
      console.log('Restarting State Machine');
      smRestartCnt++;

      sm.init(STATE_SETUP_EXTERNAL_HARDWARE);
    }
  }, 120000);
}
