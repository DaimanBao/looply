// Separate local CLI: never imported by the application or frontend bundle.
/** Reads one live fake delivery through the authenticated development-only listener. */
async function main() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.DEV_OTP_INSPECTOR_ENABLED !== "true"
  )
    throw new Error("Development inspector must be explicitly enabled");
  const key = process.env.DEV_OTP_INSPECTOR_KEY;
  const [challengeId, destination] = process.argv.slice(2);
  const port = Number(process.env.DEV_OTP_INSPECTOR_PORT || "3101");
  if (
    !key ||
    key.length < 48 ||
    !challengeId ||
    !destination ||
    !Number.isInteger(port) ||
    port < 1024 ||
    port > 65535
  )
    throw new Error("Invalid inspector arguments/configuration");
  const response = await fetch(`http://127.0.0.1:${port}/inspect`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ challengeId, destination }),
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Inspection refused (${response.status})`);
  const payload = await response.json();
  if (typeof payload.code !== "string" || !/^[0-9]{6}$/.test(payload.code))
    throw new Error("Invalid inspector response");
  process.stdout.write(`${payload.code}\n`);
}
main().catch(() => {
  process.stderr.write(
    "OTP unavailable. Check development configuration, key and live challenge.\n",
  );
  process.exitCode = 1;
});
