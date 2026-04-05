# MagicMirror² display container for Infinistream.
#
# Installs the upstream framework at the pinned version, then layers in
# the Infinistream module and display configuration.  Runs in server-only
# mode (no Electron) so the eink-service can reach it at port 8080.
#
# Build context must be the repo root:
#   docker build -f display/Dockerfile -t infinistream-display .

FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git \
 && rm -rf /var/lib/apt/lists/*

# Install MagicMirror at the known-good version
ARG MM_VERSION=v2.30.0
RUN git clone --branch ${MM_VERSION} --depth 1 \
      https://github.com/MagicMirrorOrg/MagicMirror.git /opt/magic_mirror

WORKDIR /opt/magic_mirror
RUN npm run install-mm

# Install the Infinistream module
COPY MMM-Infinistream/ /opt/magic_mirror/modules/MMM-Infinistream/
RUN cd /opt/magic_mirror/modules/MMM-Infinistream \
 && npm install --omit=dev

# Apply display config and CSS overrides
COPY display/config.js     /opt/magic_mirror/config/config.js
COPY display/css/custom.css /opt/magic_mirror/css/custom.css

EXPOSE 8080
CMD ["npm", "run", "server"]
