import time

# import the eth002 module from devantech-eth
from devantech_eth import eth008


# Create an instance of the ETH002 class and try connecting to the module
module = eth008.ETH008(ip = "192.168.1.63", port = 17494, password = "password")
module.connect()

# Toggle digital output 1
for port in range(1,9):
    module.setDigitalState(port, 0, 0)

for port in range(1,9):
    module.setDigitalState(port, 0, 1)
    time.sleep(.5)
    module.setDigitalState(port, 0, 0)
    time.sleep(.25)

# Close the connection to the module
module.close()