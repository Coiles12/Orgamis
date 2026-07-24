import {
  addDays,
  addWeeks,
  endOfWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  isValid,
  parseISO,
  startOfWeek,
} from "date-fns";
import { fr } from "date-fns/locale";

export type WeekDay = {
  date: string;
  dayLabel: string;
  dayNumber: string;
  longLabel: string;
};

export function getWeekStartDate(date: Date) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function parseWeekStart(value?: string | null) {
  if (!value) {
    return getWeekStartDate(new Date());
  }

  const parsed = parseISO(value);

  if (!isValid(parsed)) {
    return getWeekStartDate(new Date());
  }

  return getWeekStartDate(parsed);
}

export function toDateInputValue(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function toDateTimeLocalValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function getWeekLabel(weekStart: Date) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  return `${format(weekStart, "d MMM", { locale: fr })} - ${format(
    weekEnd,
    "d MMM yyyy",
    { locale: fr },
  )}`;
}

export function getWeekMeta(weekStart: Date) {
  return {
    isoWeek: getISOWeek(weekStart),
    isoYear: getISOWeekYear(weekStart),
    label: getWeekLabel(weekStart),
  };
}

export function getWeekDays(weekStart: Date): WeekDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);

    return {
      date: toDateInputValue(date),
      dayLabel: format(date, "EEE", { locale: fr }),
      dayNumber: format(date, "d"),
      longLabel: format(date, "EEEE d MMMM", { locale: fr }),
    };
  });
}

export function shiftWeek(weekStart: Date, offset: number) {
  return addWeeks(weekStart, offset);
}
