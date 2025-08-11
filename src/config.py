# /*****************************************************************************
# * | File        :	  config.py
# * | Author      :   Waveshare team
# * | Function    :   Hardware underlying interface
# * | Info        :
# *----------------
# * | This version:   V1.0
# * | Date        :   2020-12-12
# * | Info        :
# ******************************************************************************/
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documnetation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to  whom the Software is
# furished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS OR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.
#
import os
import sys
import time

class RaspberryPi:
    # Pin definition
    RST_PIN     = 18
    CS_PIN      = 22
    DRDY_PIN    = 17

    def __init__(self):
    # SPI device, bus = 0, device = 0
        import spidev
        import RPi.GPIO

        self.GPIO = RPi.GPIO
        self.SPI = spidev.SpiDev(0, 0)

    def digital_write(self, pin, value):
        self.GPIO.output(pin, value)

    def digital_read(self, pin):
        return self.GPIO.input(pin)

    def delay_ms(self, delaytime):
        time.sleep(delaytime / 1000.0)

    def spi_writebyte(self, data):
        self.SPI.writebytes(data)

    def spi_readbytes(self, reg):
        return self.SPI.readbytes(reg)

    def module_init(self):
        self.GPIO.setmode(self.GPIO.BCM)
        self.GPIO.setwarnings(False)
        self.GPIO.setup(self.RST_PIN, self.GPIO.OUT)
        self.GPIO.setup(self.CS_PIN, self.GPIO.OUT)

        self.GPIO.setup(self.DRDY_PIN, self.GPIO.IN, pull_up_down=self.GPIO.PUD_UP)
        self.SPI.max_speed_hz = 2000000
        self.SPI.mode = 0b01
        return 0

    def module_exit(self):
        self.SPI.close()
        self.GPIO.output(self.RST_PIN, 0)
        self.GPIO.output(self.CS_PIN, 0)
        self.GPIO.cleanup()


class JetsonNano:
    # Pin definition
    RST_PIN         = 18
    CS_PIN          = 22
    DRDY_PIN        = 17

    def __init__(self):
        import spidev
        self.SPI = spidev.SpiDev(0, 0)

        import Jetson.GPIO
        self.GPIO = Jetson.GPIO

    def digital_write(self, pin, value):
        self.GPIO.output(pin, value)

    def digital_read(self, pin):
        return self.GPIO.input(pin)

    def delay_ms(self, delaytime):
        time.sleep(delaytime / 1000.0)

    def spi_writebyte(self, data):
        self.SPI.writebytes(data)

    def spi_readbytes(self, reg):
        return self.SPI.readbytes(reg)

    def module_init(self):
        self.GPIO.setmode(self.GPIO.BCM)
        self.GPIO.setwarnings(False)
        self.GPIO.setup(self.RST_PIN, self.GPIO.OUT)
        self.GPIO.setup(self.CS_PIN, self.GPIO.OUT)
        self.GPIO.setup(self.DRDY_PIN, self.GPIO.IN)
        self.SPI.max_speed_hz = 2000000
        self.SPI.mode = 0b01
        return 0

    def module_exit(self):
        self.SPI.close()
        self.GPIO.output(self.RST_PIN, 0)

        self.GPIO.cleanup()

class MockHardware:
    RST_PIN = 18
    CS_PIN = 22
    DRDY_PIN = 17

    def __init__(self):
        self._pins = {}

    def digital_write(self, pin, value):
        self._pins[pin] = value

    def digital_read(self, pin):
        # Return 0 by default, can be customized for tests
        return self._pins.get(pin, 0)

    def delay_ms(self, delaytime):
        pass  # No-op for testing

    def spi_writebyte(self, data):
        pass  # No-op for testing

    def spi_readbytes(self, reg):
        # Return a list of zeros for testing
        return [0] * (reg if isinstance(reg, int) else 1)

    def module_init(self):
        return 0

    def module_exit(self):
        pass

hostname = os.popen("uname -n").read().strip()

def is_raspberry_pi():
    try:
        with open('/proc/cpuinfo', 'r') as f:
            for line in f:
                if 'Hardware' in line and 'BCM2835' in line:
                    return True
                if 'Revision' in line and ('a02082' in line or 'a020a0' in line or 'a03111' in line): # Example revisions for various Pi models
                    return True
        return False
    except FileNotFoundError:
        return False

if is_raspberry_pi():
    print("Running on a Raspberry Pi.")
    implementation = RaspberryPi()
else:
    print("Not running on a Raspberry Pi. Using MockHardware for testing.")
    implementation = MockHardware()

for func in [x for x in dir(implementation) if not x.startswith('_')]:
    setattr(sys.modules[__name__], func, getattr(implementation, func))