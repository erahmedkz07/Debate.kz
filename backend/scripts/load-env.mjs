// Loads backend/.env for `npm run dev`. Not the --env-file flag: under --watch, Node (24, Windows) then watches the
// whole folder of .env, so every uploaded cover, log line or backup restarted the dev server. Like --env-file, a
// variable already set in the environment wins.
process.loadEnvFile(new URL('../.env', import.meta.url))
