import { purgeExpiredSessions } from "../src/server/retention";

purgeExpiredSessions().then((n) => { console.log(`${n} Sitzung(en) gelöscht`); process.exit(0); });
