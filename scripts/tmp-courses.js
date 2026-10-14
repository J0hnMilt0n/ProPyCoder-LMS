const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.course
  .findMany({ select: { id: true, title: true, status: true } })
  .then((r) => console.log(JSON.stringify(r, null, 1)))
  .catch((e) => {
    console.error('ERR', e.message);
    process.exitCode = 1;
  })
  .finally(() => p['$disconnect']());
