FROM node:22-alpine
ENV RESEARCH_ENGINE=api NODE_ENV=production PORT=8080 DATA_DIR=/data BIND_ADDRESS=0.0.0.0
WORKDIR /app
COPY remote/engine.mjs remote/server.mjs remote/native-codex.mjs ./remote/
COPY backend/research.mjs ./backend/
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8080
CMD ["node","remote/server.mjs"]
