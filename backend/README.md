# Smart View Mobile Backend

A minimal Node.js/Express backend shell for the Smart View Ionic Mobile application.

## Getting Started

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

   Or start in production mode:
   ```bash
   npm start
   ```

4. The server will be running at `http://localhost:3000`

## What's Included

- **Express.js** - Minimal web framework setup
- **JSON middleware** - Built-in JSON parsing
- **Basic route** - Simple root endpoint
- **Nodemon** - Auto-restart during development

## Development

- `npm run dev` - Start with nodemon for auto-restart
- `npm start` - Start in production mode

## Next Steps

This is a basic shell. You can extend it by adding:

- Additional middleware (CORS, helmet, morgan, etc.)
- Database integration
- Authentication
- API routes
- Error handling
- Environment configuration
- Testing framework

## Example Extensions

### Add CORS support:
```bash
npm install cors
```

```javascript
const cors = require('cors');
app.use(cors());
```

### Add environment variables:
```bash
npm install dotenv
```

```javascript
require('dotenv').config();
```

### Add more routes:
```javascript
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK' });
});
```
