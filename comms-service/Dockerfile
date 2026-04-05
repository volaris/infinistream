# comms-service — RockBLOCK 9603 Iridium SBD + L76K GPS
#
# Requires access to the host serial devices:
#   /dev/ttyUSB0  — RockBLOCK 9603 (USB-to-serial)
#   /dev/ttyAMA0  — L76K GPS HAT (Pi UART)
#
# These are passed through in docker-compose.yml via the `devices` key.

FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

ENV PORT=3002
ENV ROCKBLOCK_PORT=/dev/ttyUSB0
ENV GPS_PORT=/dev/ttyAMA0
ENV GPS_BAUD=9600

EXPOSE 3002
CMD ["node", "server.js"]
