/* Example how to interface the modem using the "iTracker" and "AT" module. */

var at;
console.log("Connecting Cellular Modem ...");
require("iTracker").setCellOn(true, function (usart) {
  console.log("Cellular Modem connected.");
  at = require("AT").connect(usart);

  sendAtCommand("AT+GMR");
});

function sendAtCommand(command) {
  var data = "";
  at.cmd(command + "\r\n", 1000, function cb(d) {
    if (d === undefined || d == "ERROR") {
      console.log("Error:", d);
    } else if (d == "OK") {
      console.log(data);
    }
    else {
      data += (data ? "\n" : "") + d;
      return cb;
    }
  });
}

