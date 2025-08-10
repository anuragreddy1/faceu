const express = require('express');
const path = require('path');
const app = express();

// Serve React build folder statically
app.use(express.static(path.join(__dirname, '../../build')));

// For all routes, serve index.html (React SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../build', 'index.html'));
});

// Your existing API routes here...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
