
// api/index.js
const serverless = require("serverless-http");
const app = require("../index");   // path to root index.js

module.exports = serverless(app);