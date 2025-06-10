import env from "../env.json";

export default () => {
  console.log("env", process.env.NODE_ENV);
  const node_env = process.env.NODE_ENV || "local";
  return env[node_env];
};
