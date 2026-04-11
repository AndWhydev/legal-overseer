FROM docker.io/matrixconduit/matrix-conduit:latest

COPY conduit.toml /etc/conduit/conduit.toml

ENV CONDUIT_CONFIG=/etc/conduit/conduit.toml

VOLUME /data
EXPOSE 6167
