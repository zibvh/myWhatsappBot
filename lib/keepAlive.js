const express = require('express');
const config = require('../config');

function startKeepAliveServer(getStatus) {
  const app = express();

  app.get('/', (req, res) => {
    res.status(200).send(`${config.BOT_NAME} is running. Status: ${getStatus()}`);
  });

  app.get('/health', (req, res) => {
    res.status(200).json({ status: getStatus(), bot: config.BOT_NAME });
  });

  app.listen(config.PORT, () => {
    console.log(`[server] Health check server listening on port ${config.PORT}`);
  });
}

module.exports = { startKeepAliveServer };
