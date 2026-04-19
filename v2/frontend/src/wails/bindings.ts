export async function healthCheck() {
  try {
    return await window.go['internal/app'].App.HealthCheck();
  } catch {
    return null;
  }
}
