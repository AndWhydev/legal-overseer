FROM twentycrm/twenty:latest

USER root

# Install Redis (Alpine-based image)
RUN apk add --no-cache redis

# Custom entrypoint that starts Redis then Twenty
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

USER 1000

ENTRYPOINT ["/app/start.sh"]
CMD ["node", "dist/main"]
