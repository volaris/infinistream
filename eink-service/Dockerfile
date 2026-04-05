# E-ink rendering service for Infinistream.
#
# Takes a Puppeteer screenshot of the MagicMirror display and sends it to
# the Waveshare 7.5" V2 panel via display.py.
#
# Build context must be the eink-service directory:
#   docker build -t infinistream-eink eink-service/

FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      python3 \
      python3-pip \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PORT=3001

EXPOSE 3001
CMD ["node", "server.js"]
