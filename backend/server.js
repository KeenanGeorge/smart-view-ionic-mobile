const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic middleware
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Smart View Mobile Backend',
    status: 'running'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
