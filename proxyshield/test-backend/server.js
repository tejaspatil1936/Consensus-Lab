import http from 'http';

const server = http.createServer((req, res) => {
  // Parse URL
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  // Set JSON content type for all responses
  res.setHeader('Content-Type', 'application/json');

  // Collect body for POST/PUT
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {

    // Routes
    if (method === 'GET' && path === '/getAllUsers') {
      res.writeHead(200);
      res.end(JSON.stringify({
        users: [
          { id: 1, name: 'Alice', email: 'alice@example.com' },
          { id: 2, name: 'Bob', email: 'bob@example.com' },
          { id: 3, name: 'Charlie', email: 'charlie@example.com' }
        ]
      }));
    }
    else if (method === 'POST' && path === '/login') {
      // Simulate login — always succeed for testing
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, token: 'test-jwt-token-123' }));
    }
    else if (method === 'GET' && path === '/health') {
      res.writeHead(200);
      res.end(JSON.stringify({ status: 'healthy', uptime: process.uptime() }));
    }
    else if (method === 'POST' && path === '/search') {
      res.writeHead(200);
      res.end(JSON.stringify({ results: [], query: body }));
    }
    else if (method === 'GET' && path === '/users') {
      res.writeHead(200);
      res.end(JSON.stringify({ users: [{ id: 1, name: 'Test User' }] }));
    }
    else if (path === '/benchmark-test') {
      res.writeHead(200);
      res.end(JSON.stringify({ ok: true }));
    }
    else {
      // Default — echo back the request info
      res.writeHead(200);
      res.end(JSON.stringify({
        echo: true,
        method,
        path,
        query: Object.fromEntries(url.searchParams),
        body: body || null
      }));
    }
  });
});

const PORT = process.env.BACKEND_PORT || 8080;
server.listen(PORT, () => {
  console.log(`Test backend running on http://localhost:${PORT}`);
});
