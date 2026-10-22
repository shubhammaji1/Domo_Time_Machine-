import { Workspace } from 'domo-time-machine';
try {
  const result = await new Workspace(process.argv[2]).capture(process.argv[3], {
    name: process.argv[4],
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code }));
  process.exitCode = 2;
}
