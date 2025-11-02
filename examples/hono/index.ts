import { runLocalDevServer } from './bin/run-local-dev-server';

console.log('Running local dev server...');
console.log(process.cwd())
runLocalDevServer({
  root: process.cwd(),
});