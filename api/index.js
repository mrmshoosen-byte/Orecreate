const { handleRequest } = require("../server");

module.exports = (request, response) => {
  handleRequest(request, response).catch((error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    response.statusCode = 500;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ error: error.message || "Server error" }));
  });
};
