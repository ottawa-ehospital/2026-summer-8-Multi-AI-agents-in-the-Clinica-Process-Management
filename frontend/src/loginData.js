/**
 * readLoginData — reads the current user session from localStorage.
 *
 * Expected shape stored under the key "loginData":
 *   { type: "Doctor" | "Patient", id: number, email: string, name: string }
 *
 * Returns null if no login data is found.
 */
export function readLoginData() {
  try {
    const raw = localStorage.getItem("loginData");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * writeLoginData — persists login data to localStorage.
 */
export function writeLoginData(data) {
  try {
    localStorage.setItem("loginData", JSON.stringify(data));
  } catch {
    // ignore storage errors
  }
}

/**
 * clearLoginData — removes login data from localStorage.
 */
export function clearLoginData() {
  localStorage.removeItem("loginData");
}
