# rak8212-espruino-nb-iot
Prototyping NB-IoT devices with the RAK8212 (Quectel BG96) running Espruino

## data-logger-bg96-mqtt.js
This example shows how one could use the MQTT stack already provided by the Quectel BG96.
The advantage is that you don't need to care about the MQTT implementation on your own, e.g. by including the
Espruino MQTT module. The disadvantage is, that possibly you may want to fine-tune things in the MQTT communication
with your peer, and you can't. I think for almost all cases the Quectel MQTT stack should be sufficient and is
a good starting point.

The example creates a NB-IoT connection with the radio network, and then creates a MQTT session with the MQTT server.
It then publishes a temperature value every 60 seconds using MQTT.

**What's missing?**

NB-IoT connections may break from time to time, the MQTT session may get terminated, all this things are currently
not handled in the code. So, the code should be more resilient and expect this things to happen and possibly just
restart or take more intelligent actions.

## data-logger-mqtt.js
This example uses the Espruino MQTT module as implementation for the MQTT protocol. The example provides a
communication layer between this MQTT implementation and the BG96 which is purely used to send and receive data
to/from the remote MQTT server. This communication layer only deals with IP communication. There was the need
to introduce some queuing mechanisms, and MQTT ping/pong messages may interfere with other messages.
**My recommendation is not to use this example, as it is just to unstable and error-prone.**
 