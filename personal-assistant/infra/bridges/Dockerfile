FROM dock.mau.dev/mautrix/whatsapp:latest AS whatsapp
FROM dock.mau.dev/mautrix/gmessages:latest AS gmessages

FROM alpine:3.20

RUN apk add --no-cache bash curl jq

# Copy bridge binaries from builder stages
COPY --from=whatsapp /usr/bin/mautrix-whatsapp /usr/bin/mautrix-whatsapp
COPY --from=gmessages /usr/bin/mautrix-gmessages /usr/bin/mautrix-gmessages

# iMessage bridge requires separate build (mautrix-imessage uses Apple frameworks)
# Added when iMessage registration server infrastructure is ready

# Data directory (mounted as Fly Volume)
RUN mkdir -p /data

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV BRIDGE_PROTOCOL=""
ENV MATRIX_HOMESERVER_URL=""
ENV WEBHOOK_URL=""
ENV CONNECTION_ID=""
ENV REGISTRATION_SERVER_URL=""

VOLUME /data
ENTRYPOINT ["/entrypoint.sh"]
