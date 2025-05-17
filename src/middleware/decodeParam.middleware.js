// src/middleware/decodeParam.middleware.js
function decodeParam(paramName) {
  return function(req, res, next) {
    if (req.params && req.params[paramName]) {
      const originalParamValue = req.params[paramName];
      try {
        req.params[paramName] = decodeURIComponent(originalParamValue);
        // Optional: Log the decoding action
        console.log(`Decoded param '${paramName}': '${originalParamValue}' -> '${req.params[paramName]}'`);
      } catch (e) {
        // Log error if decoding fails (e.g., malformed URI)
        console.error(`Failed to decode URI component for param '${paramName}': Value was '${originalParamValue}'`, e);
        // Optionally, send a 400 Bad Request response if decoding fails critically
        // return res.status(400).send({ message: `Malformed URI for parameter: ${paramName}` });
      }
    }
    next();
  };
}

module.exports = decodeParam;