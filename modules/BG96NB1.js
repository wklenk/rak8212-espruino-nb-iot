/* Copyright (c) 2018 Wolfgang Klenk. See the file LICENSE for copying permission. */
/*
Quectel BG96 Narrowband IoT (NB1) functions.
*/

function string2hex(data) {
  var arr = [];
  for (var n = 0, l = data.length; n < l; n++) {
    var hex = Number(data.charCodeAt(n)).toString(16);
    if (hex.length < 2) hex = "0" + hex;
    arr.push(hex);
  }

  hex = arr.join('');

  return hex;
}

function BG96NB1Client(bg96nb1) {
  this.bg96nb1 = bg96nb1;
  this.clientWriteBusy = false;
  this.clientWriteQueue = [];
  this.clientWriteQueueTimer = null;

  console.log("BG96NB1Client created");
}

BG96NB1Client.prototype.write = function (data) {

  var client = this;
  if (client.clientWriteBusy) {

    console.log("BG96NB1Client queued " + JSON.stringify(data));
    client.clientWriteQueue.push(data);

    if (null === client.clientWriteQueueTimer) {
      client.clientWriteQueueTimer = setTimeout(function timerCb() {
        if (client.clientWriteBusy) {
          client.clientWriteQueueTimer = setTimeout(timerCb, 5000);
          return;
        }

        var data = client.clientWriteQueue.shift();
        if (undefined === data) {
          client.clientWriteQueueTimer = null;
          return; // Queue is empty
        }

        console.log("BG96NB1Client unqueued " + JSON.stringify(data));

        client.write(data);

        // Possibly still messages in the queue
        client.clientWriteQueueTimer = setTimeout(timerCb, 5000);
      }, 5000);
    }

    return;
  }

  client.clientWriteBusy = true;

  console.log("BG96NB1Client [" + JSON.stringify(data));

  var hex = string2hex(data);
  return bg96nb1.sendAtCommand('AT+QISENDEX=0,"' + hex + '"', 180000)
    .then(function () {
      // Don't wait for a response for publishing a topic
      if (0x30 !== data.charCodeAt(0)) { // FIXME: This is very specific to MQTT
        return new Promise(
          function () {
            var registerLine = '+QIURC: "recv"';
            bg96nb1.at.registerLine(registerLine, function onUrc(line) { // FIXME: Better to register before sending command?
              bg96nb1.at.unregisterLine(registerLine);

              line = line.split(",");
              var bytesToRead = line[2];

              bg96nb1.at.getData(line[2], function processData(data) {
                console.log("BG96NB1Client ] " + JSON.stringify(data));
                client.clientWriteBusy = false; // FIXME: What about timeout?
                client.emit("data", data);
              })
            })
          }
        )
      } else {
        client.clientWriteBusy = false;
      }
    })
};

BG96NB1Client.prototype.end = function () {

  var client = this;
  console.log("BG96NB1Client closing connection.");

  if (null !== client.clientWriteQueueTimer) {
    clearTimeout(client.clientWriteQueueTimer);
    client.clientWriteQueueTimer = null;
  }

  return bg96nb1.sendAtCommand("AT+QICLOSE=0", 180000)
    .then(function () {
      bg96nb1.sendAtCommand("AT+QPOWD");
    })
};

function BG96NB1(uart, options) {

  this.options = options;

  uart.removeAllListeners();
  this.at = require('AT').connect(uart);
  this.at.debug(options.debug);
}

BG96NB1.prototype.sendAtCommand = function (command, timeoutMs) {

  var at = this.at;
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

BG96NB1.prototype.getVersion = function (callback) {
  this.sendAtCommand('AT+GMR')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.powerDown = function (callback) {
  this.sendAtCommand('AT+QPOWD')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.getNetworkRegistrationStatus = function (callback) {
  sendAtCommand('AT+CREG?')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.getModeAndOperator = function (callback) {
  sendAtCommand('AT+COPS?')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.getSignalQuality = function (callback) {
  sendAtCommand('AT+CSQ')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.getVersion = function (callback) {
  sendAtCommand('')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.openSocket = function (callback) {

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

  var at = this.at;
  var bg96nb1 = this;

  // +QIURC: "closed",<connectID>
  // <connectID> Integer type. The socket service index. The range is 0-11.
  at.registerLine('+QIURC: "closed"', function () {
    BG96NB1Client.emit('end');
  });

  bg96nb1.sendAtCommand('AT&F0')
    .then(function () {
      return bg96nb1.sendAtCommand('ATE0');
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+CPIN?'); // Fails on locked PIN
    })
    .then(function () {
      var band_value = band_values[bg96nb1.options.band];
      if (undefined === band_value) throw("Unknown band: " + bg96nb1.options.band);

      return bg96nb1.sendAtCommand('AT+QCFG="band",0,0,' + band_value + ',1');
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+QCFG="nwscanmode",3,1'); // Network Search Mode, LTE only
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+QCFG="nwscanseq",030102,1'); // Network Search Sequence, NB-Iot, GSM, CatM1
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+QCFG="iotopmode",1,1'); // LTE Search Mode: NB-IoT only
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+QCFG="servicedomain",1,1'); // Set PS domain, PS only
    })
    .then(function () {
      if (undefined === bg96nb1.options.apn) throw("APN undefined");
      return bg96nb1.sendAtCommand('AT+CGDCONT=1,"IP",' + JSON.stringify(bg96nb1.options.apn));
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+CFUN=1');
    })
    .then(function () {
      // Manually register to network.
      // Modem LED should flash on-off-off-off periodically to indicate network search
      if (undefined === bg96nb1.options.operator) throw("Operator undefined");
      return bg96nb1.sendAtCommand('AT+COPS=1,2,' + JSON.stringify(bg96nb1.options.operator) + ',9', 1800000);
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+QIACT=1', 150000);
    })
    .then(function () {
      return bg96nb1.sendAtCommand('AT+QIOPEN=1,0,"TCP",' + JSON.stringify(bg96nb1.options.server) + ',' + bg96nb1.options.port + ',0,1', 150000);
    })
    .then(function () {
      return new Promise(function (resolve, reject) {
        var registerLine = '+QIOPEN: ';
        at.registerLine(registerLine, function onUrc(line) {
          at.unregisterLine(registerLine);

          line = line.substr(9).split(',');
          var err = line[1];

          if (err !== '0') {
            reject('Socket open failed');
          } else {
            resolve();
          }
        });
      })
    })
    .then(function () {
      return new Promise(function (resolve) {
        callback(new BG96NB1Client(bg96nb1));
        resolve();
      })
    })
};


//
// This is 'exported' so it can be used with
// require('BG96NB1.js').connect(uart, options)
//
// options = {
//   server : Hostname or IP address of server (mandatory)
//   port : Port to connect to (mandatory)
//   band : One of "B1", "B2", ... , "B28" (mandatory)
//   apn : Access point name (mandatory)
//   operator: Network operator (numeric format) (mandatory)
// }
//
// Value "B8" for LTE Band B8 for Deutsche Telekom / 1NCE
// Value "B20" for LTE Band B20 for Vodafone Deutschland
//
// Vodafone IoT APN: "vgesace.nb.iot"    operator: "26202"
// 1NCE APN' : "iot.1nce.net"            operator: "26201"
//
// callback provides "client" function object as argument that can be used
// to send data and end the connection.
//
exports.connect = function (uart, options) {
  return new BG96NB1(uart, options);
};
