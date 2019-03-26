/*
  Example how to upload SSL certificates to the Quectel BG96 module using AT commands.

  Steps:
  Cut and paste your certificates in PEM format to the code.
  Interactively call "uploadCertificates();" on the device's JavaScript console after
  uploading the code to the device.


  Copyright (C) 2019 Wolfgang Klenk <wolfgang.klenk@gmail.com>

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

var debug = false;
var FILENAME_CLIENT_CERT = "cert.pem";
var FILENAME_PRIVATE_KEY = "key.pem";
var FILENAME_TRUSTED_ROOT_CA = "cacert.pem";
var at;

// 3a34634a38-certificate.pem.crt - Cut and paste
var client_cert = '-----BEGIN CERTIFICATE-----\n' +
  'MIIDWjCCAkKgAwIBAgIVAJZ543Y5NgA10ni3ARw3huZhA01OMA0GCSqGSIb3DQEB\n' +
  'CwUAME0xSzBJBgNVBAsMQkFtYXpvbiBXZWIgU2VydmljZXMgTz1BbWF6b24uY29t\n' +
  'IEluYy4gTD1TZWF0dGxlIFNUPVdhc2hpbmd0b24gQz1VUzAeFw0xOTAzMjUyMDMw\n' +
  'NDZaFw00OTEyMzEyMzU5NTlaMB4xHDAaBgNVBAMME0FXUyBJb1QgQ2VydGlmaWNh\n' +
  'dGUwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDCrFmv9kMjJ0Jhucd3\n' +
  'hThnHwjI1vvYWfHqho4yZhy5kFlot0e0GwtdInMYdiKISlTDQz90iK2dnp6U1aW3\n' +
  'IajR93MFI7Vj9hyOr/cci98zqnOxnvcXf4Lxi6zrcw/aMSB3WIFRWPnzpERIeZJO\n' +
  '+PK7YAnJ0ynZo4ir3c8IuDX8u8pj6PB4ohrkHz0O4i8qN7WNFgRgmR8oAf4D6nzC\n' +
  'gLmemN/xaEB54C2lnSTIpFmyp7qHQBg2lULqDOQkig6bV8K1qrfsLXLECTa+rhoF\n' +
  'VqFrqXqJw9djyj93LAkTjMdXQu8mWVKnvYi0TLXpf1m4H+UMbgQNgsMRg/CoHPmy\n' +
  'lq4tAgMBAAGjYDBeMB8GA1UdIwQYMBaAFPYoAgVcRLr4N6NKDWJpQ6NWJKKHMB0G\n' +
  'A1UdDgQWBBTVKpy0Jrf8M6UVSyAV5qPEtDVrsTAMBgNVHRMBAf8EAjAAMA4GA1Ud\n' +
  'DwEB/wQEAwIHgDANBgkqhkiG9w0BAQsFAAOCAQEAYvr983hMVoUgd3WXQsW74AI0\n' +
  '4ycas0hPAUSLW6i5J4RkLY9rOH+ppnycmKCD3oOfVCpBlWf5nhsJ12p7NCgYJSa8\n' +
  'Cl3GjWdXpoYX+Sv7BiMBHFfzNQjZf6A/vk+9bCg1hTfWY2+wWsvqQ/u/xWG9rgaF\n' +
  'rtvdZ3dYbrXVKjq5QvKqxuLmM0Wbsf7gmo9WxF7wDF5uZHGKNH++qn9Id7txGbyO\n' +
  'nTlJ4447tguozlbTMl9Bup9+iUMeXOZwhzHI45uqnA4AYVUDB2fu+TBz1ogwnXOD\n' +
  'ZlkWZNh/iBObuNC4J8/njsXP7R0eCNj9K4FFoInQ776COPe9hSQhnMequlw2MQ==\n' +
  '-----END CERTIFICATE-----\n';

// 3a34634a38-private.pem.key - Cut and paste
var client_private_key = '-----BEGIN RSA PRIVATE KEY-----\n' +
  'MIIEpAIBAAKCAQEAwqxZr/ZDIydCYbnHd4U4Zx8IyNb72Fnx6oaOMmYcuZBZaLdH\n' +
  'tBsLXSJzGHYiiEpUw0M/dIitnZ6elNWltyGo0fdzBSO1Y/Ycjq/3HIvfM6pzsZ73\n' +
  'F3+C8Yus63MP2jEgd1iBUVj586RESHmSTvjyu2AJydMp2aOIq93PCLg1/LvKY+jw\n' +
  'eKIa5B89DuIvKje1jRYEYJkfKAH+A+p8woC5npjf8WhAeeAtpZ0kyKRZsqe6h0AY\n' +
  'NpVC6gzkJIoOm1fCtaq37C1yxAk2vq4aBVaha6l6icPXY8o/dywJE4zHV0LvJllS\n' +
  'p72ItEy16X9ZuB/lDG4EDYLDEYPwqBz5spauLQIDAQABAoIBAQC4i0gOXgZxGbN9\n' +
  'Du9/ZyP75difA+YEx+dkKyA7uL88ThHkCfMIUqboKFMxejPsPYKzBFnwL+1dwVOV\n' +
  'xh7tRxRRzyETWzGGTHXv8fHw9suln81DMW4NsYxBTOak4RPDBNVBLf6RTibNCAjP\n' +
  'J6hCAw+f/z/oOqyuq69RNdkg6/gJ15hWsOh61rkarPYo7YkgtbIDaJ2AXWqBz5G6\n' +
  'q7+u914CO2zEaotH1WVvXfTi9mjiAXyFlURw6Tk2gqIJKB13rL1fcnFK+1OikN3T\n' +
  'M938UEZMrATzX+UZfVD4NGlAs9UGqBX74XOdvle0WGftCcAHVzmtsNkrxJN8YZf2\n' +
  'i3u5ShOhAoGBAOcpUiMluQoeSoRJhdz2+/SPkeRN2QuQHH//fPXENGk2kjt2jnFN\n' +
  'pb5UvNe3vuL7sW3Z5+4uSWRRUtZXLkYTiN6MqvbTYIx+O3I/v2zM8rXfzn4vf5aH\n' +
  'NBhLwkHSMTaepvggND/SsjHtYeJjeTC20sMhOc6bf50s0CW+xBE0Rb0VAoGBANeX\n' +
  'VIizWRA9VPrfubW/nU1BOzhTvqa+LBzjzI0CtgcpDaOm/UObVUZ3IVCPgz3oENA3\n' +
  '7uD8Zs83LCJl0/p5EnPIWOI9vSstelULwC3aH1nWmgSXmBGAiwzckGk/Zmlt5OrZ\n' +
  'CO+lSnoZmtDMSR2KjZQWncdl9vh7AkFpMe88U2K5AoGBALyAA4zJvCS2IsnRMqnH\n' +
  'dhot4SgtGyrEr5jo/Dtlbd/GMmTu/qUCTn/wlbXLDowF9t+/a9PcRtjZQBWtLfzS\n' +
  '/S+NwfRY1kh6v3sg5LaSQfFxue9ISGC1jBOr45LNFniV005O5IyPAeSY0NNNjovc\n' +
  '6e1Y8My8HMpMuses0jG9UIkpAoGAMGS4xgK0MFAEHlhQAHslnSzSVT9/IUC4+Dcu\n' +
  'OEzufUb618xpN17L0oh1Qvcj96Z697JGfdxKW6M/1ezTm3rH6JOFWCuRpfqMZkC/\n' +
  '/8rhlLH2WqeIrA0VqWptRCLGI05Wv1y+g8Svph7PQKVKmEX8p8w32IWL3ZUHGZW6\n' +
  'bsA024kCgYBKslLmy8iDL4tc8ZBKTSitut52nLoGLurIsjfISlcuj87fThvFG5q+\n' +
  '72mTAlFiF2lPDId+kkFDiuSp6lkz30f5/Nl+LZwUGtPaANykjocIdOWGoi+Z2lNe\n' +
  'q6QT+CyUCX7I40wIkPfujsYoBGvM/MDRqnN36J4Kjc/RdnXPs25tLw==\n' +
  '-----END RSA PRIVATE KEY-----\n';

// RSA 2048 bit key: Amazon Root CA 1
var trusted_root_ca = '-----BEGIN CERTIFICATE-----\n' +
  'MIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\n' +
  'ADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\n' +
  'b24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\n' +
  'MAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\n' +
  'b3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\n' +
  'ca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n' +
  '9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\n' +
  'IFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\n' +
  'VOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n' +
  '93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\n' +
  'jgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\n' +
  'AYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\n' +
  'A4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\n' +
  'U5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\n' +
  'N+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\n' +
  'o/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n' +
  '5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\n' +
  'rqXRfboQnoZsG4q5WTP468SQvvG5\n' +
  '-----END CERTIFICATE-----';


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

    var prompt = 'CONNECT';
    var answer = "";

    if (sendLineAfterPrompt) {
      at.register(prompt, (line) => {
        at.unregister(prompt);
        at.write(sendLineAfterPrompt);
        return line.substr(prompt.length);
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

// Calculate a checksum of the file.
// Checksum is calculated by doing a XOR operation for every 2 bytes
function calculateChecksum(data) {
  var checksum = [0x00, 0x00];
  for(var i = 0; i < data.length; i+=2) {
    checksum[0] ^= data.charCodeAt(i);

    if ((i+1) >= data.length) {
      checksum[1] ^= 0x00;
    } else {
      checksum[1] ^= data.charCodeAt(i+1);
    }
  }

  var checksumAsNumber = (checksum[0] << 8) | checksum[1];

  return checksumAsNumber;
}

// Upload certificates
function uploadCertificates() {
  console.log("Connecting Cellular Modem ...");
  require("iTracker").setCellOn(true, function (usart) {
    console.log("Cellular Modem connected.");
    at = require("AT").connect(usart);
    at.debug(debug);

    sendAtCommand('AT&F0')
      .then(() => sendAtCommand('ATE0'))
      // List all files in UFS directory
      .then(() => sendAtCommand('AT+QFLST="*"'))
      .then((line) => {
        console.log("Files in file system: " + line);
      })
      // Delete all files in UFS directory
      .then(() => sendAtCommand('AT+QFDEL="*"'))
      .then( () => sendAtCommandAndWaitForPrompt(
        'AT+QFUPL="' + FILENAME_CLIENT_CERT +'",' + client_cert.length + ',100',
        1000,
        client_cert,
        '+QFUPL:'
        )
      )
      .then((line) => {
        console.log("+QFUPL line:", line, "Uploaded", FILENAME_CLIENT_CERT);
        var returnedChecksum = parseInt(line.split(',')[1], 16);
        var expectedChecksum = calculateChecksum(client_cert);

        if (returnedChecksum !== expectedChecksum) {
          throw new Error('Checksums do not match.');
        }
      })
      .then( () => sendAtCommandAndWaitForPrompt(
        'AT+QFUPL="' + FILENAME_PRIVATE_KEY + '",' + client_private_key.length + ',100',
        1000,
        client_private_key,
        '+QFUPL:'
        )
      )
      .then((line) => {
        console.log("+QFUPL line:", line, "Uploaded", FILENAME_PRIVATE_KEY);
        var returnedChecksum = parseInt(line.split(',')[1], 16);
        var expectedChecksum = calculateChecksum(client_private_key);

        if (returnedChecksum !== expectedChecksum) {
          throw new Error('Checksums do not match.');
        }
      })
      .then( () => sendAtCommandAndWaitForPrompt(
        'AT+QFUPL="' + FILENAME_TRUSTED_ROOT_CA + '",' + trusted_root_ca.length + ',100',
        1000,
        trusted_root_ca,
        '+QFUPL:'
        )
      )
      .then((line) => {
        console.log("+QFUPL line:", line, "Uploaded", FILENAME_TRUSTED_ROOT_CA);
        var returnedChecksum = parseInt(line.split(',')[1], 16);
        var expectedChecksum = calculateChecksum(trusted_root_ca);

        if (returnedChecksum !== expectedChecksum) {
          throw new Error('Checksums do not match.');
        }

        console.log("\nSuccessfully uploaded SSL certificates to BG96 module.");
      })
      .catch((err) => {
        console.log('Could not upload SSL certificates to BG96 module:', err);
      });
  });
}

