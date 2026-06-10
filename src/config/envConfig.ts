import env from "../env.json";

export default () => {
  const node_env = process.env.NODE_ENV || "local";
  return env[node_env];
};
