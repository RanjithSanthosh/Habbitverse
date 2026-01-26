export const getISTDate = (): string => {
  // robustly calculation IST (UTC+5:30)
  const d = new Date();
  // Convert to UTC ms
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  // Add 5.5 hours for IST
  const nd = new Date(utc + 3600000 * 5.5);
  // Return YYYY-MM-DD
  return nd.toISOString().split("T")[0];
};

export const getISTTime = (): string => {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const nd = new Date(utc + 3600000 * 5.5);
  // Return HH:MM
  const hours = nd.getHours().toString().padStart(2, "0");
  const minutes = nd.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};
