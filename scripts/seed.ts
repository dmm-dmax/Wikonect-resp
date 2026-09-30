import { createDoctor, createPractice } from "../src/server/auth/provision";
import { totpUri } from "../src/server/auth/totp";

/** Entwicklungsdaten. Nur synthetisch. */
async function main() {
  const practice = await createPractice("Demo-Praxis (synthetisch)");
  const email = "arzt@example.test";
  const password = "demo-passwort-123";
  const d = await createDoctor(practice.id, email, "Dr. Demo", password);
  console.log(`Arzt: ${email} / ${password}`);
  console.log(`TOTP-Secret (Base32): ${d.totpSecret}`);
  console.log(`otpauth-URI: ${totpUri(d.totpSecret, email)}`);
  process.exit(0);
}
main();
