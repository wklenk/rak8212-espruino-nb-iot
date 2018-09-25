# rak8212-espruino-nb-iot
Prototyping NB-IoT devices with the RAK8212 (Quectel BG96) running Espruino

##Note: This is work under progress and not functional

The biggest issue currently is that, after transfering the code to
the RAK8212 and waiting for the initialization to have finished,
when I call `save()` the complete RAK8212 freezes.
Need to press the Reset button to get it back to live.

I am using the Bluetooth console, so I don't think it is
an issue with the serial terminal being changed.

    >reset();
    =undefined
     ____                 _
    |  __|___ ___ ___ _ _|_|___ ___
    |  __|_ -| . |  _| | | |   | . |
    |____|___|  _|_| |___|_|_|_|___|
             |_| espruino.com
     1v99 (c) 2018 G.Williams
    Espruino is Open Source. Our work is supported
    only by sales of official boards and donations:
    http://espruino.com/Donate
    >require("Storage").eraseAll()
    =undefined
    >process.env
    ={
      VERSION: "1v99",
      GIT_COMMIT: "5b447a6",
      BOARD: "RAK8212",
      FLASH: 524288, RAM: 65536,
      SERIAL: "733724a6-34f76187",
      CONSOLE: "Bluetooth",
      MODULES: "Flash,Storage,net" ... "IS2MDL,GPS,LIS3DH",
      EXPTR: 536882356 }
    No errors in BG96NB1. Minified 10016 bytes to 4761 bytes.
    >
     ____                 _
    |  __|___ ___ ___ _ _|_|___ ___
    |  __|_ -| . |  _| | | |   | . |
    |____|___|  _|_| |___|_|_|_|___|
             |_| espruino.com
     1v99 (c) 2018 G.Williams
    Espruino is Open Source. Our work is supported
    only by sales of official boards and donations:
    http://espruino.com/Donate
    >Setting up external hardware. Please wait ...
    BME280 wiring set up.
    Quectel BG96 wiring set up.
    >save();
    =undefined
    Compacting Flash...
    Calculating Size...
 
And that's it :(