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
  this.debug = bg96nb1.options.debug;
  this.clientWriteBusy = false;
  this.clientWriteQueue = [];
  this.clientWriteQueueTimer = null;

  if (this.debug) console.log("BG96NB1Client created");
}

BG96NB1Client.prototype.write = function (data) {

  var client = this;
  if (client.clientWriteBusy) {

    if (client.debug) console.log("BG96NB1Client queued " + JSON.stringify(data));
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

        if (client.debug) console.log("BG96NB1Client unqueued " + JSON.stringify(data));

        client.write(data);

        // Possibly still messages in the queue
        client.clientWriteQueueTimer = setTimeout(timerCb, 5000);
      }, 5000);
    }

    return;
  }

  client.clientWriteBusy = true;

  if (client.debug) console.log("BG96NB1Client [" + JSON.stringify(data));

  var hex = string2hex(data);
  return bg96nb1.sendAtCommand('AT+QISENDEX=0,"' + hex + '"', 180000)
    .then(function resolve() {
      client.clientWriteBusy = false;
    },
    function reject(err) {
      if (client.debug) console.log("BG96NB1Client Error sending data.");
      client.clientWriteBusy = false;
    })
};

BG96NB1Client.prototype.end = function () {

  var client = this;
  if (client.debug) console.log("BG96NB1Client closing connection.");

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
  var bg96nb1 = this;

  bg96nb1.options = options;

  uart.removeAllListeners();
  bg96nb1.at = require('AT').connect(uart);
  bg96nb1.at.debug(options.debug);
  bg96nb1.client = null;
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
  this.sendAtCommand('AT+CREG?')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.getModeAndOperator = function (callback) {
  this.sendAtCommand('AT+COPS?')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.getSignalQuality = function (callback) {
  this.sendAtCommand('AT+CSQ')
    .then(function resolve(v) {
      callback(v);
    }, function reject(reason) {
      callback(reason);
    });
};

BG96NB1.prototype.getPacketDataCounter = function (callback) {
  this.sendAtCommand('AT+QGDCNT?')
    .then(function resolve(v) {
      var counters = v.substr(9).split(',');
      var bytesSent = counters[0];
      var bytesReceived = counters[1];
      callback(bytesSent, bytesReceived);
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
  at.unregisterLine('+QIURC: "closed"');
  at.registerLine('+QIURC: "closed"', function () {
    BG96NB1Client.emit('end');
  });

  var registerLine = '+QIURC: "recv"';
  at.unregisterLine(registerLine);
  at.registerLine(registerLine, function onUrc(line) {
    line = line.split(",");
    var bytesToRead = line[2];

    at.getData(line[2], function processData(data) {
      if (bg96nb1.options.debug) console.log("BG96NB1Client ] " + JSON.stringify(data));

      if (null !== bg96nb1.client) {
        bg96nb1.client.emit("data", data);
      }
    })
  })

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
        bg96nb1.client = new BG96NB1Client(bg96nb1);
        callback(bg96nb1.client);
        resolve();
      },
      function (err) {
        return bg96nb1.sendAtCommand('AT+QPOWD');
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
// Vodafone IoT APN: "vgesace.nb.iot" operator: "26202" band: "B20"
// 1NCE APN' : "iot.1nce.net"         operator: "26201" band: "B8"
//
// callback provides "client" function object as argument that can be used
// to send data and end the connection.
//
exports.connect = function (uart, options) {
  return new BG96NB1(uart, options);
};
