const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('MCP Server is running! 👊');
});

// Add more routes/APIs as needed for your MCP server

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server listening on port ${PORT}`);
});
