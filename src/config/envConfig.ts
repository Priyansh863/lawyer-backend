export default () => {
  let env: any;
  try {
    env = require("../env.json");
  } catch {
    try {
      env = require("../env.example.json");
    } catch {
      env = {};
    }
  }
  const node_env = process.env.NODE_ENV || "local";
  return env[node_env] || {};
};
