FROM node:10-stretch-slim

LABEL version="6.1.1"
LABEL description="Docker file for SCC State Server"

RUN mkdir -p /usr/src/
WORKDIR /usr/src/
COPY . /usr/src/

RUN rm -rf node_modules || true
RUN yarn install --frozen-lockfile --non-interactive

EXPOSE 7777

USER node
CMD ["yarn", "start"]
