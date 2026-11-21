// Dashboard calendar follows the botica's local date, independently of device time zone.
export const boticaDate = (value = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
export const boticaHour = () =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Lima",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
