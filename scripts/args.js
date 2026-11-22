// node script.js --city=Lviv --year 2025 --dry-run  →  { city: 'Lviv', year: '2025', 'dry-run': true }
// Підтримуються обидві форми: --key=value і --key value
export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const [key, ...rest] = arg.slice(2).split('=');
    if (rest.length) {
      args[key] = rest.join('=');
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      args[key] = argv[++i];
    } else {
      args[key] = true;
    }
  }
  return args;
}
