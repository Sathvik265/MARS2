const http = require('http');

const data = JSON.stringify({ text: "Hello\r\n" });

const options = {
  hostname: '127.0.0.1',
  port: 8000,
  path: '/api/printer/print',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => {
    process.stdout.write(d);
  });
});

req.on('error', error => {
  console.error(error);
});

req.write(data);
req.end();
