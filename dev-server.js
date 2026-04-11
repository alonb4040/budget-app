// שרת פיתוח מקומי לפונקציות Netlify
// הרץ: node dev-server.js
// יאזין על http://localhost:8888

const http = require("http");
const handler = require("./netlify/functions/bookmarklet-import");

const PORT = 8888;

const server = http.createServer(async (req, res) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    res.writeHead(200, cors);
    res.end();
    return;
  }

  if (req.url !== "/.netlify/functions/bookmarklet-import") {
    res.writeHead(404, cors);
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const event = {
        httpMethod: req.method,
        headers: req.headers,
        body,
        isBase64Encoded: false,
      };

      // טען משתני סביבה מ-.env
      require("dotenv").config();

      const result = await handler.handler(event);
      res.writeHead(result.statusCode, { ...cors, ...result.headers });
      res.end(result.body);
    } catch (e) {
      res.writeHead(500, cors);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Dev server running on http://localhost:${PORT}`);
  console.log(`   Bookmarklet function: http://localhost:${PORT}/.netlify/functions/bookmarklet-import`);
});
