export function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function monthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

export function formatKoreanDate(value: Date | string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}
export function getDefaultStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function formatDate(date: Date | string | null | undefined) {
  if (!date) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));
}
