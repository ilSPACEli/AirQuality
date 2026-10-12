// node script.js --city=Lviv --dry-run  →  { city: 'Lviv', 'dry-run': true }
export function parseArgs(argv = process.argv.slice(2)) {
  return Object.fromEntries(
    argv
      .filter(arg => arg.startsWith('--'))
      .map(arg => {
        const [key, ...rest] = arg.slice(2).split('=');
        return [key, rest.length ? rest.join('=') : true];
      })
  );
}
