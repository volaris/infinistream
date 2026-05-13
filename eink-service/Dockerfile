# E-ink rendering service for Infinistream.
#
# Keeps a persistent Selenium browser pointed at the MagicMirror container;
# a Flask webhook (/trigger) captures a screenshot and pushes it to the
# Waveshare 7.5" V2 panel via display.py.
#
# Build context must be the eink-service directory:
#   docker build -t infinistream-eink eink-service/

FROM debian:bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      python3 \
      python3-pip \
      python3-dev \
      python3-gpiozero \
      python3-numpy \
      chromium \
      chromium-driver \
      gcc \
      make \
      git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# lgpio C library is not in Debian Bookworm repos — build from source.
RUN git clone --depth 1 https://github.com/joan2937/lg.git /tmp/lg \
 && make -C /tmp/lg \
 && make -C /tmp/lg install \
 && ldconfig \
 && rm -rf /tmp/lg

# waveshare_epd is not on PyPI — clone and install from source.
RUN git clone --depth 1 https://github.com/waveshareteam/e-Paper.git /tmp/e-paper \
 && pip3 install --no-cache-dir --break-system-packages --no-deps \
      /tmp/e-paper/RaspberryPi_JetsonNano/python \
 && pip3 install --no-cache-dir --break-system-packages "rpi-lgpio" \
 && rm -rf /tmp/e-paper

COPY service.py display.py ./

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
ENV PORT=3001

EXPOSE 3001
CMD ["python3", "service.py"]
